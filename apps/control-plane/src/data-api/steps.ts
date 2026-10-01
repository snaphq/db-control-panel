import { buildScramSecret } from '../crypto/scram.js';
import { type SecretBox, sealContext } from '../crypto/secretbox.js';
import type { ComputeRuntime } from '../neon/compute-runtime.js';
import { type StepContext, forEndpoint, gone } from '../neon/steps/deps.js';
import type { EndpointRow, NeonStore } from '../neon/store.js';
import {
  NonRetryableError,
  type StepDefinition,
  type StepRegistry,
} from '../operations/steps.js';
import {
  BootstrapError,
  type SqlConnector,
  type SqlSession,
  bootstrapDataApi,
} from './bootstrap.js';

/**
 * Plans of `data_api.enable` and `data_api.disable`. The API has already set
 * the database's `data_api_enabled` flag and sidecar index, the branch's
 * `authenticator` password and the project's keys, so a compute that starts
 * from here on gets its PostgREST container from the sidecar provider.
 *
 * An operation targets a database, or a whole project (`targetType: 'project'`)
 * when the project's JWKS changed: PostgREST reads its keys from the
 * environment, so every compute that runs a sidecar restarts to pick them up.
 */

export interface DataApiStepDeps {
  store: NeonStore;
  runtime: ComputeRuntime;
  secrets: SecretBox;
  connect: SqlConnector;
}

const POSTGRES_PORT = 5432;
/** SQLSTATE for a rejected password. */
const INVALID_PASSWORD = '28P01';

const isProjectScope = (context: StepContext): boolean =>
  context.operation.targetType === 'project';

async function databaseContext(deps: DataApiStepDeps, context: StepContext) {
  const found = await deps.store.getDatabaseContext(context.operation.targetId);
  if (!found) throw gone('Database', context.operation.targetId);
  return found;
}

/** The branch's `read_write` endpoint: the only one that can take the bootstrap SQL. */
async function writableEndpoint(
  store: NeonStore,
  branchId: string,
): Promise<EndpointRow> {
  const endpoint = (await store.listBranchEndpoints(branchId)).find(
    (e) => e.type === 'read_write',
  );
  if (!endpoint) {
    throw new NonRetryableError(
      `Branch ${branchId} has no read_write endpoint to run the Data API setup on`,
    );
  }
  return endpoint;
}

/** Stops the compute and starts it again, so its pod is built from the current database state. */
async function restart(runtime: ComputeRuntime, endpointId: string) {
  await forEndpoint(() => runtime.suspend(endpointId));
  const woken = await forEndpoint(() => runtime.wake(endpointId));
  return { restarted: true, podIp: woken.podIp };
}

/** Every running compute of the project whose branch has a Data API database. */
async function restartProjectSidecars(
  deps: DataApiStepDeps,
  projectId: string,
): Promise<{ restarted: string[] }> {
  const restarted: string[] = [];
  for (const branch of await deps.store.listProjectBranches(projectId)) {
    const databases = await deps.store.listBranchDatabases(branch.id);
    if (!databases.some((d) => d.dataApiEnabled)) continue;
    for (const endpoint of await deps.store.listBranchEndpoints(branch.id)) {
      if (endpoint.state !== 'running') continue; // an idle compute reads the keys on its next start
      await restart(deps.runtime, endpoint.id);
      restarted.push(endpoint.id);
    }
  }
  return { restarted };
}

function dataApiEnableSteps(deps: DataApiStepDeps): StepDefinition[] {
  return [
    {
      name: 'data_api.enable.wake',
      async run(context) {
        if (isProjectScope(context)) return { skipped: true };
        const { branch } = await databaseContext(deps, context);
        const endpoint = await writableEndpoint(deps.store, branch.id);
        const woken = await forEndpoint(() => deps.runtime.wake(endpoint.id));
        return { endpointId: endpoint.id, coldStart: woken.coldStart };
      },
    },
    {
      name: 'data_api.enable.bootstrap',
      async run(context) {
        if (isProjectScope(context)) return { skipped: true };
        const { database, branch } = await databaseContext(deps, context);
        const endpoint = await writableEndpoint(deps.store, branch.id);
        const owner = (await deps.store.listBranchRoles(branch.id)).find(
          (r) => r.name === database.ownerRole,
        );
        if (!owner?.passwordEnc) {
          throw new NonRetryableError(
            `The password of role "${database.ownerRole}" is not stored; reset it and enable the Data API again`,
          );
        }
        if (!branch.authenticatorPasswordEnc) {
          throw new NonRetryableError(
            `Branch ${branch.id} has no authenticator password`,
          );
        }
        const authenticator = deps.secrets.open(
          branch.authenticatorPasswordEnc,
          sealContext.authenticatorPassword,
        );
        const ownerPassword = deps.secrets.open(
          owner.passwordEnc,
          sealContext.rolePassword(owner.name),
        );
        // wake() is cheap for a running compute and returns the current pod IP.
        const { podIp } = await forEndpoint(() =>
          deps.runtime.wake(endpoint.id),
        );
        const rejected = () =>
          new NonRetryableError(
            `Role "${owner.name}" rejected the stored password; reset it and enable the Data API again`,
          );
        let session: SqlSession;
        try {
          session = await deps.connect({
            host: podIp,
            port: POSTGRES_PORT,
            database: database.name,
            user: owner.name,
            password: ownerPassword,
          });
        } catch (error) {
          if ((error as { code?: string }).code === INVALID_PASSWORD) {
            throw rejected();
          }
          throw error;
        }
        try {
          return await bootstrapDataApi(session, {
            authenticatorScramSecret: buildScramSecret(authenticator),
          });
        } catch (error) {
          if (
            error instanceof BootstrapError &&
            error.code === INVALID_PASSWORD
          ) {
            throw rejected();
          }
          throw error;
        } finally {
          await session.close().catch(() => undefined);
        }
      },
    },
    {
      name: 'data_api.enable.restart',
      async run(context) {
        if (isProjectScope(context)) {
          return restartProjectSidecars(deps, context.operation.targetId);
        }
        const { branch } = await databaseContext(deps, context);
        const endpoint = await writableEndpoint(deps.store, branch.id);
        const woken = context.outputs['data_api.enable.wake'] as {
          coldStart?: boolean;
        } | null;
        // A compute that this operation started was built with the sidecar already.
        if (woken?.coldStart) return { restarted: false };
        return restart(deps.runtime, endpoint.id);
      },
    },
  ];
}

function dataApiDisableSteps(deps: DataApiStepDeps): StepDefinition[] {
  return [
    {
      name: 'data_api.disable.restart',
      async run(context) {
        const { branch } = await databaseContext(deps, context);
        const endpoints = await deps.store.listBranchEndpoints(branch.id);
        const restarted: string[] = [];
        // The flag is already off, so the new pod has no sidecar for the database.
        for (const endpoint of endpoints) {
          if (endpoint.state !== 'running') continue;
          await restart(deps.runtime, endpoint.id);
          restarted.push(endpoint.id);
        }
        return { restarted };
      },
    },
  ];
}

export function registerDataApiSteps(
  registry: StepRegistry,
  deps: DataApiStepDeps,
): StepRegistry {
  const plans = [
    ['data_api.enable', dataApiEnableSteps(deps)],
    ['data_api.disable', dataApiDisableSteps(deps)],
  ] as const;
  for (const [action, steps] of plans) {
    for (const step of steps) registry.registerStep(step);
    registry.registerPlan(
      action,
      steps.map((s) => s.name),
    );
  }
  return registry;
}
