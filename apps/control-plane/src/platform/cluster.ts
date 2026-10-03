import type { NodeRow } from '../neon/store.js';
import type { LayoutNode } from './layout.js';
import type { SafekeeperRow } from './store.js';

/**
 * The cluster as the layout policy sees it, read from the `node` table that the
 * worker's node sync fills from Kubernetes (libsql/nodes-sync.ts). Safekeepers
 * run on nodes that carry the pageserver role label `alloydb.net/pageserver`:
 * those are the storage-plane nodes, and using the existing label means the
 * node-join playbook needs no new role.
 */

const SAFEKEEPER_NODE_ROLE = 'pageserver';

interface ClusterNodes {
  nodes: LayoutNode[];
  /** Kubernetes `kubernetes.io/hostname` per node id, for the pod's nodeSelector. */
  hostnames: Map<number, string>;
}

type Capacity = {
  ready?: unknown;
  missing?: unknown;
  hostname?: unknown;
  allocatable?: { storageBytes?: unknown };
};

/**
 * `volumeBytes` is what each live safekeeper claims on its node. Free space is
 * the node's allocatable ephemeral storage minus those claims: an estimate that
 * ranks candidates (Kubernetes reports no free-disk figure without a metrics
 * stack) and is never a hard limit.
 */
export function readClusterNodes(
  rows: NodeRow[],
  liveSafekeepers: Pick<SafekeeperRow, 'nodeId'>[],
  volumeBytes: number,
): ClusterNodes {
  const nodes: LayoutNode[] = [];
  const hostnames = new Map<number, string>();
  for (const row of rows) {
    const capacity = row.capacity as Capacity;
    // A node that left the cluster is not in the list at all: its safekeepers
    // become "stranded" instead of looking placeable.
    if (capacity.missing === true) continue;
    const claimed =
      liveSafekeepers.filter((sk) => sk.nodeId === row.id).length * volumeBytes;
    const storage = capacity.allocatable?.storageBytes;
    nodes.push({
      id: row.id,
      eligible: row.roles.includes(SAFEKEEPER_NODE_ROLE),
      ready: capacity.ready !== false,
      freeBytes: (typeof storage === 'number' ? storage : 0) - claimed,
    });
    hostnames.set(
      row.id,
      typeof capacity.hostname === 'string' ? capacity.hostname : row.name,
    );
  }
  return { nodes, hostnames };
}
