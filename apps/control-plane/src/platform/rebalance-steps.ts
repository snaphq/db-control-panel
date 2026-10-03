import { StorconError } from '../neon/storcon-http.js';
import { NonRetryableError, type StepDefinition } from '../operations/steps.js';
import type { PlatformDeps } from './deps.js';
import { rebalanceNodes, rebalanceShards } from './rebalance-inputs.js';
import {
  type RebalanceMove,
  type RebalancePlan,
  planRebalance,
} from './rebalance-plan.js';

/**
 * Plan of `pageservers.rebalance`:
 *
 *   plan     read the controller's nodes and tenants, choose a bounded list of moves
 *   execute  move the tenants one at a time and wait for each to settle
 *
 * The compute hook does the rest: when a shard's attachment changes the
 * controller calls `PUT /storcon/notify-attach` (neon-glue-storcon.ts), which
 * repoints the computes that are running. A move is therefore "settled" only
 * once the controller reports the shard attached on the new node and no compute
 * notification is pending.
 */

const PLAN = 'platform.rebalance.plan';

interface RebalancePlanOutput extends RebalancePlan {
  /** Pageserver availability zone by node id, for the preferred-AZ update. */
  azs: Record<number, string>;
}

type MoveStatus = 'moved' | 'already' | 'skipped' | 'failed';
interface MoveResult {
  shardId: string;
  tenantId: string;
  status: MoveStatus;
  reason?: string;
}

const failedWith = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Reads the controller and the control plane's own operations into a plan. */
async function buildRebalancePlan(
  deps: PlatformDeps,
): Promise<RebalancePlanOutput> {
  const [nodes, tenants, rows, busy] = await Promise.all([
    deps.storcon.listNodes(),
    deps.admin.listTenants(),
    deps.neon.listNodes(),
    deps.neon.listTenantsWithActiveOperations(),
  ]);
  const plan = planRebalance({
    nodes: rebalanceNodes(nodes, rows),
    shards: rebalanceShards(tenants, new Set(busy)),
    maxMoves: deps.config.rebalanceMaxMoves,
  });
  return {
    ...plan,
    azs: Object.fromEntries(nodes.map((n) => [n.id, n.availability_zone_id])),
  };
}

/**
 * Moves one shard and waits for it to settle.
 *
 * Verified against the controller (storage_controller/src/service.rs:6733-6895):
 * the migrate call refuses a destination whose score is worse than the
 * scheduler's best (412), and the score is availability zone first, then the
 * tenant's own other shards; load is ignored (tenant_shard.rs:915-950,
 * scheduler.rs:202-209). So when the destination is in another zone the shard's
 * preferred zone is changed first; otherwise the optimiser would also move it
 * back (tenant_shard.rs:983-989).
 */
async function moveShard(
  deps: PlatformDeps,
  move: RebalanceMove,
  azs: Record<number, string>,
): Promise<MoveResult> {
  const { admin, config } = deps;
  const base = { shardId: move.shardId, tenantId: move.tenantId };
  const skip = (reason: string): MoveResult => ({
    ...base,
    status: 'skipped',
    reason,
  });
  const find = async () =>
    (await admin.describeTenant(move.tenantId))?.shards.find(
      (s) => s.tenant_shard_id === move.shardId,
    );

  const shard = await find();
  if (!shard) return skip('the tenant no longer exists');
  if (shard.node_attached === move.toNodeId)
    return { ...base, status: 'already' };
  if (shard.node_attached !== move.fromNodeId) {
    return skip(
      `it is attached to node ${shard.node_attached}, not ${move.fromNodeId}`,
    );
  }
  if (
    shard.is_reconciling ||
    shard.is_pending_compute_notification ||
    shard.is_splitting ||
    shard.is_importing ||
    shard.scheduling_policy !== 'Active' ||
    (await deps.neon.listTenantsWithActiveOperations()).includes(move.tenantId)
  ) {
    return skip('something else is changing it');
  }

  const originalAz = shard.preferred_az_id;
  const targetAz = azs[move.toNodeId] ?? null;
  const restoreAz = async () => {
    if (targetAz !== null && originalAz !== targetAz) {
      await admin
        .setPreferredAzs({ [move.shardId]: originalAz })
        .catch(() => []);
    }
  };
  if (targetAz !== null && originalAz !== targetAz) {
    await admin.setPreferredAzs({ [move.shardId]: targetAz });
  }

  try {
    await admin.migrateShard({
      shardId: move.shardId,
      nodeId: move.toNodeId,
      originNodeId: move.fromNodeId,
      prewarm: config.rebalancePrewarm,
    });
  } catch (error) {
    await restoreAz();
    // 412: unavailable, worse-scoring or no longer attached there; 404: gone;
    // 400: unknown node. None of them is worth a retry of this move.
    if (
      error instanceof StorconError &&
      error.status !== null &&
      [400, 404, 412].includes(error.status)
    ) {
      return skip(`the controller refused: ${failedWith(error)}`);
    }
    throw error;
  }

  const deadline = deps.now() + config.settleTimeoutMs;
  while (deps.now() < deadline) {
    const current = await find();
    if (!current) return skip('the tenant disappeared while moving');
    if (
      current.node_attached === move.toNodeId &&
      !current.is_reconciling &&
      !current.is_pending_compute_notification
    ) {
      return { ...base, status: 'moved' };
    }
    await deps.sleep(config.pollIntervalMs);
  }

  // Not settled in time: ask for the shard to stay where it is, which cancels a
  // graceful migration still waiting for its secondary (service.rs:6818-6830).
  try {
    await admin.migrateShard({
      shardId: move.shardId,
      nodeId: move.fromNodeId,
      originNodeId: move.fromNodeId,
      prewarm: false,
    });
  } catch (error) {
    // 412 means it moved after all.
    if (error instanceof StorconError && error.status === 412) {
      return { ...base, status: 'moved' };
    }
    deps.logger.warn(
      `cancelling the move of ${move.shardId} failed: ${failedWith(error)}`,
    );
  }
  await restoreAz();
  return {
    ...base,
    status: 'failed',
    reason: `it did not settle on node ${move.toNodeId} within ${Math.round(config.settleTimeoutMs / 1000)}s`,
  };
}

export function rebalanceSteps(deps: PlatformDeps): StepDefinition[] {
  return [
    {
      name: PLAN,
      async run() {
        return buildRebalancePlan(deps);
      },
    },
    {
      name: 'platform.rebalance.execute',
      async run({ outputs, resume, checkpoint }) {
        const plan = outputs[PLAN] as RebalancePlanOutput;
        const results = [
          ...((resume as { results?: MoveResult[] } | undefined)?.results ??
            []),
        ];
        const finished = new Set(results.map((r) => r.shardId));
        for (const move of plan.moves) {
          if (finished.has(move.shardId)) continue;
          results.push(await moveShard(deps, move, plan.azs));
          await checkpoint({ results });
        }
        const count = (status: MoveStatus) =>
          results.filter((r) => r.status === status).length;
        const summary = {
          moved: count('moved') + count('already'),
          skipped: count('skipped'),
          failed: count('failed'),
          results,
        };
        if (summary.failed > 0) {
          const first = results.find((r) => r.status === 'failed');
          throw new NonRetryableError(
            `${summary.failed} of ${plan.moves.length} tenant move(s) failed after ${summary.moved} succeeded; first: ${first?.shardId}: ${first?.reason}`,
          );
        }
        return summary;
      },
    },
  ];
}
