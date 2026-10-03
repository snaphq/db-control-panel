import type { StorconTenant } from '../neon/storcon-admin.js';
import type { StorconNode } from '../neon/storcon-client.js';
import type { NodeRow } from '../neon/store.js';
import type { RebalanceNode, RebalanceShard } from './rebalance-plan.js';

/**
 * What the planner needs, read from the controller's description of its nodes
 * and tenants (storage_controller/src/http.rs:956-972 and :920-938).
 *
 * A pageserver takes part when both its `availability` (Active, WarmingUp or
 * Offline) and its `scheduling` policy (Active, Pause, Draining and others,
 * controller_api.rs:158-175, :396-403) are Active; an unavailable node is
 * refused as a destination anyway (service.rs:6757-6769).
 */
export function isSchedulable(node: StorconNode): boolean {
  return node.availability === 'Active' && node.scheduling === 'Active';
}

/** `capacity.pageserverWeight` on a node row, an optional relative capacity (default 1). */
function weightOf(row: NodeRow | undefined): number | undefined {
  const weight = (row?.capacity as { pageserverWeight?: unknown } | undefined)
    ?.pageserverWeight;
  return typeof weight === 'number' && weight > 0 ? weight : undefined;
}

export function rebalanceNodes(
  nodes: StorconNode[],
  rows: NodeRow[],
): RebalanceNode[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return nodes.map((node) => ({
    id: node.id,
    az: node.availability_zone_id,
    eligible: isSchedulable(node),
    weight: weightOf(byId.get(node.id)),
  }));
}

/**
 * A shard is busy when the controller is working on it (reconciling, splitting
 * or importing, or a compute notification is still pending), when its
 * scheduling policy is not Active (the optimiser, and so this planner, must
 * leave it), or when the control plane has an operation running on its project.
 */
export function rebalanceShards(
  tenants: StorconTenant[],
  busyTenantIds: ReadonlySet<string>,
): RebalanceShard[] {
  return tenants.flatMap((tenant) =>
    tenant.shards.map((shard) => ({
      shardId: shard.tenant_shard_id,
      tenantId: tenant.tenant_id,
      nodeId: shard.node_attached,
      busy:
        shard.is_reconciling ||
        shard.is_pending_compute_notification ||
        shard.is_splitting ||
        shard.is_importing ||
        shard.scheduling_policy !== 'Active' ||
        busyTenantIds.has(tenant.tenant_id),
    })),
  );
}
