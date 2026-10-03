import {
  type AdminNode,
  type AdminNodesResponse,
  type AdminSafekeeper,
  type AdminSafekeepersResponse,
  type ListPlatformOperationsResponse,
  PLATFORM_OPERATION_ACTIONS,
  type PlatformOperation,
  listPlatformOperationsQuerySchema,
} from '@repo/control-plane-contract';
import { Hono } from 'hono';
import type { PlatformOperationAction } from '../db/schema.js';
import { parseQuantity } from '../libsql/nodes-sync.js';
import type { LibsqlStore } from '../libsql/store.js';
import { safekeeperAz, safekeeperHostname } from '../neon/safekeepers.js';
import type { NodeRow } from '../neon/store.js';
import type { NeonStore } from '../neon/store.js';
import { InvalidCursorError } from '../operations/repository.js';
import type { OperationRecord } from '../operations/store.js';
import { readClusterNodes } from '../platform/cluster.js';
import { planSafekeeperLayout } from '../platform/layout.js';
import {
  PlatformBusyError,
  type PlatformStore,
  type SafekeeperRow,
} from '../platform/store.js';
import { bearerAuth } from './auth.js';

export interface AdminRouteDeps {
  /** The admin portal's bearer token; the console's token is not accepted here. */
  adminApiToken: string;
  store: Pick<NeonStore, 'listNodes'>;
  libsql: Pick<LibsqlStore, 'countByNode'>;
  platform: PlatformStore;
  /** Safekeepers wanted; the controller's `--timeline-safekeeper-count`. */
  safekeeperCount: number;
  /** Volume size per safekeeper, a Kubernetes quantity; ranks nodes by free space. */
  safekeeperStorage: string;
}

type Capacity = {
  ready?: unknown;
  missing?: unknown;
  hostname?: unknown;
  labels?: unknown;
  allocatable?: {
    cpuMillis?: unknown;
    memoryBytes?: unknown;
    storageBytes?: unknown;
  };
  pageserver?: {
    availability?: unknown;
    scheduling?: unknown;
    attachedShards?: unknown;
    observedAt?: unknown;
  };
};

const text = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;
const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) ? value : null;
const iso = (value: Date | null) => value?.toISOString() ?? null;

function toAdminNode(
  row: NodeRow,
  safekeepers: SafekeeperRow[],
  libsqlDatabases: number,
): AdminNode {
  const capacity = row.capacity as Capacity;
  const stats = capacity.pageserver;
  const labels: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    (capacity.labels as Record<string, unknown> | undefined) ?? {},
  )) {
    if (typeof value === 'string') labels[key] = value;
  }
  const hasPageserver =
    row.roles.includes('pageserver') || row.registeredPageserver;
  return {
    id: row.id,
    name: row.name,
    hostname: text(capacity.hostname) ?? row.name,
    zone: row.zone,
    tailscale_ip: row.tailscaleIp,
    roles: row.roles,
    ready: capacity.ready !== false,
    missing: capacity.missing === true,
    labels,
    allocatable: {
      cpu_millis: count(capacity.allocatable?.cpuMillis),
      memory_bytes: count(capacity.allocatable?.memoryBytes),
      storage_bytes: count(capacity.allocatable?.storageBytes),
    },
    pageserver: hasPageserver
      ? {
          registered: row.registeredPageserver,
          availability: text(stats?.availability),
          scheduling: text(stats?.scheduling),
          attached_shards: count(stats?.attachedShards),
          observed_at: text(stats?.observedAt),
        }
      : null,
    safekeepers: safekeepers
      .filter((sk) => sk.nodeId === row.id && sk.state !== 'retired')
      .map((sk) => ({ id: sk.id, state: sk.state })),
    libsql_databases: libsqlDatabases,
    updated_at: row.updatedAt.toISOString(),
  };
}

function toAdminSafekeeper(row: SafekeeperRow): AdminSafekeeper {
  return {
    id: row.id,
    node_id: row.nodeId,
    node_name: row.nodeName,
    availability_zone: safekeeperAz(row.id),
    hostname: safekeeperHostname(row.id),
    state: row.state,
    operation_id: row.operationId,
    drain: row.drain
      ? {
          total: row.drain.total,
          migrated: row.drain.migrated,
          failed: row.drain.failed,
          updated_at: row.drain.updatedAt,
        }
      : null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    retired_at: iso(row.retiredAt),
  };
}

function toPlatformOperation(record: OperationRecord): PlatformOperation {
  const action = PLATFORM_OPERATION_ACTIONS.find((a) => a === record.action);
  if (!action) {
    throw new Error(
      `Operation ${record.id} (${record.action}) is not a platform operation`,
    );
  }
  return {
    id: record.id,
    action,
    status: record.status,
    failures_count: record.failuresCount,
    error: record.error,
    params: record.params,
    progress: {
      completed_steps: record.progress.completedSteps,
      outputs: record.progress.outputs,
    },
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
    finished_at: iso(record.finishedAt),
  };
}

const error = (status: 400 | 404 | 409, code: string, message: string) =>
  [{ error: { code, message } }, status] as const;

/**
 * `/v1/admin/*`: platform-wide reads and the two platform operations. Its own
 * bearer token (`ALLOYDB_ADMIN_API_TOKEN`, held only by the admin portal; the
 * console's token is refused with 401), no organization or project headers,
 * and its operations are not listed in (or locked by) any project.
 */
export function createAdminRoutes(deps: AdminRouteDeps): Hono {
  const admin = new Hono();
  admin.use('*', bearerAuth(deps.adminApiToken));

  admin.get('/nodes', async (c) => {
    const [rows, safekeepers, libsqlCounts] = await Promise.all([
      deps.store.listNodes(),
      deps.platform.listSafekeepers(),
      deps.libsql.countByNode(),
    ]);
    const body: AdminNodesResponse = {
      nodes: rows.map((row) =>
        toAdminNode(row, safekeepers, libsqlCounts.get(row.id) ?? 0),
      ),
    };
    return c.json(body);
  });

  admin.get('/safekeepers', async (c) => {
    const [rows, nodeRows] = await Promise.all([
      deps.platform.listSafekeepers(),
      deps.store.listNodes(),
    ]);
    const live = rows.filter(
      (r) => r.state === 'creating' || r.state === 'active',
    );
    const volumeBytes = parseQuantity(deps.safekeeperStorage) ?? 0;
    const layout = planSafekeeperLayout({
      nodes: readClusterNodes(nodeRows, live, volumeBytes).nodes,
      safekeepers: live.map((r) => ({ id: r.id, nodeId: r.nodeId })),
      count: deps.safekeeperCount,
    });
    const body: AdminSafekeepersResponse = {
      safekeepers: rows.map(toAdminSafekeeper),
      layout: {
        desired_count: deps.safekeeperCount,
        target_per_node: layout.target,
        create_on_nodes: layout.create,
        next_move: layout.move
          ? {
              remove_safekeeper: layout.move.remove,
              from_node_id: layout.move.fromNodeId,
              to_node_id: layout.move.toNodeId,
            }
          : null,
        stranded: layout.stranded,
        blocked: layout.blocked,
      },
    };
    return c.json(body);
  });

  /** Starts a platform operation; one at a time, whatever the action. */
  const start =
    (action: PlatformOperationAction) => async (c: import('hono').Context) => {
      try {
        const record = await deps.platform.createOperation({
          action,
          params: { reason: 'manual' },
        });
        return c.json({ operation: toPlatformOperation(record) }, 202);
      } catch (failure) {
        if (failure instanceof PlatformBusyError) {
          return c.json(...error(409, 'platform_busy', failure.message));
        }
        throw failure;
      }
    };
  admin.post('/pageservers/rebalance', start('pageservers.rebalance'));
  admin.post('/safekeepers/spread', start('safekeepers.spread'));

  admin.get('/operations', async (c) => {
    const parsed = listPlatformOperationsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'query'}: ${i.message}`)
        .join('; ');
      return c.json(...error(400, 'bad_request', message));
    }
    try {
      const page = await deps.platform.listOperations({
        status: parsed.data.status,
        limit: parsed.data.limit,
        cursor: parsed.data.cursor,
      });
      const body: ListPlatformOperationsResponse = {
        operations: page.operations.map(toPlatformOperation),
        next_cursor: page.nextCursor,
      };
      return c.json(body);
    } catch (failure) {
      if (failure instanceof InvalidCursorError) {
        return c.json(
          ...error(400, 'bad_request', 'cursor: not a valid cursor'),
        );
      }
      throw failure;
    }
  });

  admin.get('/operations/:id', async (c) => {
    const record = await deps.platform.findOperation(c.req.param('id'));
    if (!record)
      return c.json(...error(404, 'not_found', 'Operation not found'));
    return c.json({ operation: toPlatformOperation(record) });
  });

  // Without this an unknown admin path would fall through to the console
  // routes and be answered with a complaint about missing headers.
  admin.all('*', (c) =>
    c.json(...error(404, 'not_found', 'No such admin route')),
  );
  return admin;
}
