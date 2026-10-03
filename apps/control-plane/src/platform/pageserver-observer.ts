import type { StorconTenant } from '../neon/storcon-admin.js';
import type { PlatformDeps } from './deps.js';
import {
  isSchedulable,
  rebalanceNodes,
  rebalanceShards,
} from './rebalance-inputs.js';
import { planRebalance } from './rebalance-plan.js';
import { PlatformBusyError } from './store.js';

/** What the worker remembers about each pageserver in `node.capacity.pageserver`. */
interface PageserverStats {
  availability: string;
  scheduling: string;
  /** Shards the controller wants attached there; null while the controller could not be asked. */
  attachedShards: number | null;
  observedAt: string;
  /** The pageserver has been Active before, so a rebalance already considered it. */
  activeSeen: boolean;
}

export interface ObserveResult {
  /** The rebalance operation started for pageservers that just became Active. */
  rebalanceOperation: string | null;
  newlyActive: number[];
}

/**
 * The worker's periodic look at the pageservers. It records, for the admin API,
 * each one's state and how many shards are attached to it, and it starts a
 * `pageservers.rebalance` operation when a pageserver becomes Active for the
 * first time, because the controller places new tenants on the emptiest
 * pageserver but never moves existing ones for balance.
 *
 * A new pageserver is only marked as seen once a rebalance considered it: when
 * the controller cannot be asked, or another platform operation is running, the
 * next pass tries again. It is marked without an operation when there is
 * nothing to move or `autoRebalance` is off.
 */
export async function observePageservers(
  deps: PlatformDeps,
  options: { autoRebalance: boolean },
): Promise<ObserveResult> {
  const nodes = await deps.storcon.listNodes();
  const rows = await deps.neon.listNodes();
  const byId = new Map(rows.map((r) => [r.id, r]));

  let tenants: StorconTenant[] | null = null;
  try {
    tenants = await deps.admin.listTenants();
  } catch (error) {
    // 503 while the controller is still starting; the counts are best effort.
    deps.logger.warn(
      `pageserver observer: tenants unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const attached = new Map<number, number>();
  for (const tenant of tenants ?? []) {
    for (const shard of tenant.shards) {
      if (shard.node_attached === null) continue;
      attached.set(
        shard.node_attached,
        (attached.get(shard.node_attached) ?? 0) + 1,
      );
    }
  }

  const previous = (id: number) =>
    byId.get(id)?.capacity.pageserver as Partial<PageserverStats> | undefined;
  const newlyActive = nodes
    .filter((n) => isSchedulable(n) && previous(n.id)?.activeSeen !== true)
    .map((n) => n.id);

  let rebalanceOperation: string | null = null;
  let considered = tenants !== null;
  if (tenants !== null && newlyActive.length > 0) {
    const plan = planRebalance({
      nodes: rebalanceNodes(nodes, rows),
      shards: rebalanceShards(
        tenants,
        new Set(await deps.neon.listTenantsWithActiveOperations()),
      ),
      maxMoves: deps.config.rebalanceMaxMoves,
    });
    if (plan.moves.length > 0 && options.autoRebalance) {
      try {
        const started = await deps.platform.createOperation({
          action: 'pageservers.rebalance',
          params: { reason: 'pageserver-joined', nodeIds: newlyActive },
        });
        rebalanceOperation = started.id;
        deps.logger.info(
          `started pageservers.rebalance ${started.id} for node(s) ${newlyActive.join(', ')}`,
        );
      } catch (error) {
        if (!(error instanceof PlatformBusyError)) throw error;
        considered = false;
      }
    }
  }

  const observedAt = new Date(deps.now()).toISOString();
  for (const node of nodes) {
    const row = byId.get(node.id);
    if (!row) continue;
    const stats: PageserverStats = {
      availability: node.availability,
      scheduling: node.scheduling,
      attachedShards:
        tenants === null
          ? (previous(node.id)?.attachedShards ?? null)
          : (attached.get(node.id) ?? 0),
      observedAt,
      activeSeen:
        previous(node.id)?.activeSeen === true ||
        (considered && newlyActive.includes(node.id)),
    };
    await deps.neon.upsertNode({
      id: row.id,
      name: row.name,
      tailscaleIp: row.tailscaleIp,
      zone: row.zone,
      addRoles: [],
      capacity: { pageserver: stats },
    });
  }
  return { rebalanceOperation, newlyActive };
}
