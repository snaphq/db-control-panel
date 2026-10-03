/**
 * Pageserver rebalancing planner (docs-internal/platform/control-plane.mdx,
 * "Pageserver rebalancing"). A pure function of the controller's view of who is
 * attached where, so it is unit-tested without a cluster.
 *
 * The storage controller places new tenants on the least loaded pageserver, but
 * never moves attached tenants for balance: its optimiser ignores load and the
 * shard count (`for_optimization`, storage_controller/src/scheduler.rs:202-209).
 * A pageserver that joins an existing cluster therefore stays empty until this
 * planner moves tenants onto it.
 */

export interface RebalanceNode {
  id: number;
  /** Where the node's pageserver sits, as the controller reports it. */
  az: string;
  /** `availability` is Active and `scheduling` is Active. Other nodes neither give nor receive. */
  eligible: boolean;
  /** Relative capacity; a node with weight 2 should hold twice the tenants. Defaults to 1. */
  weight?: number;
}

export interface RebalanceShard {
  shardId: string;
  tenantId: string;
  /** Where the controller wants it attached, or null for a detached shard. */
  nodeId: number | null;
  /**
   * Something is changing it: the controller is reconciling, splitting or
   * importing it, a compute notification is pending, its scheduling policy is
   * not Active, or the control plane has an operation running on its project.
   */
  busy: boolean;
}

export interface RebalanceMove {
  shardId: string;
  tenantId: string;
  fromNodeId: number;
  toNodeId: number;
}

export interface RebalancePlan {
  moves: RebalanceMove[];
  /** Attached shards per eligible node before and after the planned moves. */
  before: Record<number, number>;
  after: Record<number, number>;
  /** True when no further move is possible or would help; false when `maxMoves` stopped the plan. */
  balanced: boolean;
}

interface PlanInput {
  nodes: RebalanceNode[];
  shards: RebalanceShard[];
  /** Upper bound on moves per run. */
  maxMoves: number;
}

export function planRebalance(input: PlanInput): RebalancePlan {
  const nodes = input.nodes.filter((n) => n.eligible);
  const weight = new Map(
    nodes.map((n) => [n.id, Math.max(n.weight ?? 1, 0.01)]),
  );
  const counts = new Map(nodes.map((n) => [n.id, 0]));
  const movable = new Map<number, RebalanceShard[]>(
    nodes.map((n) => [n.id, []]),
  );

  for (const shard of input.shards) {
    if (shard.nodeId === null || !counts.has(shard.nodeId)) continue;
    counts.set(shard.nodeId, (counts.get(shard.nodeId) ?? 0) + 1);
    if (!shard.busy) movable.get(shard.nodeId)?.push(shard);
  }
  for (const list of movable.values()) {
    list.sort((a, b) => (a.shardId < b.shardId ? -1 : 1));
  }

  const before = Object.fromEntries(counts);
  const load = (id: number) => (counts.get(id) ?? 0) / (weight.get(id) ?? 1);
  const moves: RebalanceMove[] = [];
  let balanced = false;

  while (true) {
    // Move from the fullest node that has something movable to the emptiest.
    const source = nodes
      .filter((n) => (movable.get(n.id)?.length ?? 0) > 0)
      .sort((a, b) => load(b.id) - load(a.id) || a.id - b.id)[0];
    const target = [...nodes].sort(
      (a, b) => load(a.id) - load(b.id) || a.id - b.id,
    )[0];
    // Only move when the source stays above the target's current load once the
    // tenant has left: a difference of one tenant is already balanced, and
    // moving it would only swap the two nodes' roles (and flap on the next run).
    const improves =
      source !== undefined &&
      target !== undefined &&
      source.id !== target.id &&
      ((counts.get(source.id) ?? 0) - 1) / (weight.get(source.id) ?? 1) >
        load(target.id);
    if (!improves) {
      balanced = true;
      break;
    }
    if (moves.length >= input.maxMoves) break;
    const shard = movable.get(source.id)?.shift();
    if (!shard) break;
    moves.push({
      shardId: shard.shardId,
      tenantId: shard.tenantId,
      fromNodeId: source.id,
      toNodeId: target.id,
    });
    counts.set(source.id, (counts.get(source.id) ?? 0) - 1);
    counts.set(target.id, (counts.get(target.id) ?? 0) + 1);
  }

  return { moves, before, after: Object.fromEntries(counts), balanced };
}
