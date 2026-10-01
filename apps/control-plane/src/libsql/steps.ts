import { z } from 'zod';
import { type StepContext, readParams } from '../neon/steps/deps.js';
import type { LibsqlDatabaseRow, NodeRow } from '../neon/store.js';
import {
  NonRetryableError,
  type StepDefinition,
  type StepRegistry,
} from '../operations/steps.js';
import { type SqldAdminClient, SqldAdminError } from './admin-client.js';
import type { LibsqlKube } from './kube.js';
import type { LibsqlStore } from './store.js';

/**
 * Plans of `libsql.create`, `libsql.fork` and `libsql.delete`. The API has
 * already written the `libsql_database` row (state `creating`, or soft-deleted
 * for a delete); every step converges on the same end state when repeated:
 * sqld's "already exists" and "does not exist" answers count as success, and
 * Kubernetes objects are created or corrected, never blindly re-created.
 */

export interface LibsqlStepDeps {
  store: LibsqlStore;
  admin: SqldAdminClient;
  kube: LibsqlKube;
  /** Public hosts are `<namespace>.<suffix>`. */
  hostSuffix: string;
}

const forkParams = z.object({
  sourceNamespace: z.string().min(1),
  /** ISO instant to fork the data as of; absent forks the current state. */
  timestamp: z.string().datetime({ offset: true }).optional(),
});

const deleteParams = z.object({ keepBackup: z.boolean().default(false) });

async function load(
  deps: LibsqlStepDeps,
  context: StepContext,
  options?: { includeDeleted?: boolean },
): Promise<{ row: LibsqlDatabaseRow; node: NodeRow }> {
  const row = await deps.store.get(context.operation.targetId, options);
  if (!row) {
    throw new NonRetryableError(
      `libSQL database ${context.operation.targetId} no longer exists`,
    );
  }
  const node = await deps.store.getNode(row.nodeId);
  if (!node) {
    throw new NonRetryableError(
      `libSQL database ${row.id} is placed on unknown node ${row.nodeId}`,
    );
  }
  return { row, node };
}

/** sqld refusing the request itself (4xx other than 429) cannot succeed on retry. */
function adminFailure(error: unknown): never {
  if (
    error instanceof SqldAdminError &&
    error.status !== null &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 429
  ) {
    throw new NonRetryableError(error.message);
  }
  throw error;
}

/** Shared by create and fork: the node's Service, the database's route, then `active`. */
function exposureSteps(deps: LibsqlStepDeps): StepDefinition[] {
  return [
    {
      name: 'libsql.service',
      async run(context) {
        const { node } = await load(deps, context);
        await deps.kube.ensureNodeService(node.id, node.tailscaleIp);
        return { service: `sqld-node-${node.id}` };
      },
    },
    {
      name: 'libsql.route',
      async run(context) {
        const { row } = await load(deps, context);
        const host = `${row.namespace}.${deps.hostSuffix}`;
        await deps.kube.ensureRoute({
          namespace: row.namespace,
          host,
          nodeId: row.nodeId,
        });
        return { host };
      },
    },
    {
      name: 'libsql.activate',
      async run(context) {
        const { row } = await load(deps, context);
        await deps.store.setState(row.id, 'active');
        return { state: 'active' };
      },
    },
  ];
}

function libsqlCreateSteps(deps: LibsqlStepDeps): StepDefinition[] {
  return [
    {
      name: 'libsql.create.namespace',
      async run(context) {
        const { row, node } = await load(deps, context);
        try {
          const result = await deps.admin.createNamespace(
            node.tailscaleIp,
            row.namespace,
            { maxDbSizeBytes: row.sizeLimitBytes ?? undefined },
          );
          return { result, nodeId: node.id };
        } catch (error) {
          return adminFailure(error);
        }
      },
    },
    ...exposureSteps(deps),
  ];
}

function libsqlForkSteps(deps: LibsqlStepDeps): StepDefinition[] {
  return [
    {
      name: 'libsql.fork.namespace',
      async run(context) {
        const params = readParams(context, forkParams);
        const { row, node } = await load(deps, context);
        try {
          const result = await deps.admin.forkNamespace(
            node.tailscaleIp,
            params.sourceNamespace,
            row.namespace,
            params.timestamp ? new Date(params.timestamp) : undefined,
          );
          return { result, nodeId: node.id };
        } catch (error) {
          return adminFailure(error);
        }
      },
    },
    ...exposureSteps(deps),
  ];
}

function libsqlDeleteSteps(deps: LibsqlStepDeps): StepDefinition[] {
  return [
    {
      // Closing the door first means no new connection reaches a database that
      // is being removed.
      name: 'libsql.delete.route',
      async run(context) {
        const { row } = await load(deps, context, { includeDeleted: true });
        await deps.kube.deleteRoute(row.namespace);
        return { route: row.namespace };
      },
    },
    {
      name: 'libsql.delete.namespace',
      async run(context) {
        const { keepBackup } = readParams(context, deleteParams);
        const { row, node } = await load(deps, context, {
          includeDeleted: true,
        });
        try {
          const result = await deps.admin.deleteNamespace(
            node.tailscaleIp,
            row.namespace,
            { keepBackup },
          );
          return { result, keepBackup };
        } catch (error) {
          return adminFailure(error);
        }
      },
    },
  ];
}

/** Registers every libSQL plan. Shared steps are registered once. */
export function registerLibsqlSteps(
  registry: StepRegistry,
  deps: LibsqlStepDeps,
): StepRegistry {
  const create = libsqlCreateSteps(deps);
  const fork = libsqlForkSteps(deps);
  const remove = libsqlDeleteSteps(deps);
  const shared = new Set(exposureSteps(deps).map((s) => s.name));
  const seen = new Set<string>();
  for (const step of [...create, ...fork, ...remove]) {
    if (shared.has(step.name) && seen.has(step.name)) continue;
    seen.add(step.name);
    registry.registerStep(step);
  }
  const names = (steps: StepDefinition[]) => steps.map((s) => s.name);
  registry.registerPlan('libsql.create', names(create));
  registry.registerPlan('libsql.fork', names(fork));
  registry.registerPlan('libsql.delete', names(remove));
  return registry;
}
