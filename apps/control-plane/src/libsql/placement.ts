import type { NodeRow } from '../neon/store.js';

/**
 * Where a new libSQL database goes: the node with the `libsql` role that has the
 * largest free share of its capacity. sqld keeps 200 namespaces active at once
 * (`--max-active-namespaces 200` in infra/k8s/libsql/daemonset.yaml), which is
 * the default capacity; `node.capacity.libsqlMaxDatabases` overrides it.
 */
const DEFAULT_LIBSQL_MAX_DATABASES = 200;

const LIBSQL_ROLE = 'libsql';

function capacityOf(node: NodeRow): number {
  const configured = node.capacity.libsqlMaxDatabases;
  return typeof configured === 'number' &&
    Number.isFinite(configured) &&
    configured > 0
    ? Math.floor(configured)
    : DEFAULT_LIBSQL_MAX_DATABASES;
}

/** Fraction of the node's database slots that are still free, from 0 to 1. */
export function freeShare(node: NodeRow, databaseCount: number): number {
  const capacity = capacityOf(node);
  return Math.max(0, (capacity - databaseCount) / capacity);
}

/** The node sync marks a Kubernetes node that is not Ready with `capacity.ready = false`. */
const isUsable = (node: NodeRow): boolean =>
  node.roles.includes(LIBSQL_ROLE) && node.capacity.ready !== false;

/**
 * The best node for a new database, or null when none has a free slot. Ties go
 * to the lowest node id so the choice is deterministic.
 */
export function pickLibsqlNode(
  nodes: NodeRow[],
  databaseCounts: ReadonlyMap<number, number>,
): NodeRow | null {
  let best: { node: NodeRow; share: number } | null = null;
  for (const node of nodes) {
    if (!isUsable(node)) continue;
    const share = freeShare(node, databaseCounts.get(node.id) ?? 0);
    if (share <= 0) continue;
    if (
      !best ||
      share > best.share ||
      (share === best.share && node.id < best.node.id)
    ) {
      best = { node, share };
    }
  }
  return best?.node ?? null;
}
