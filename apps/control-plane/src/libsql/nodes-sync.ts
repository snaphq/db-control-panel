import type { V1Node } from '@kubernetes/client-node';
import type { NeonStore } from '../neon/store.js';

/**
 * Copies the cluster's nodes into the `node` table so placement can read them
 * without calling Kubernetes. The node contract is in
 * docs-internal/platform/architecture.mdx: the node-join playbook labels every
 * node `alloydb.net/node-id` and, per role, `alloydb.net/{pageserver,libsql,
 * compute}=true`; k3s runs with `node-ip` set to the Tailscale address, so the
 * node's InternalIP is it (the optional annotation `alloydb.net/tailscale-ip`
 * overrides).
 */

const LABEL_NODE_ID = 'alloydb.net/node-id';
const ANNOTATION_TAILSCALE_IP = 'alloydb.net/tailscale-ip';
const ROLES = ['pageserver', 'libsql', 'compute'] as const;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export interface NodeSource {
  listNode(): Promise<{ items: V1Node[] }>;
}

interface ParsedNode {
  id: number;
  name: string;
  tailscaleIp: string;
  zone: string;
  roles: string[];
  ready: boolean;
  /** `kubernetes.io/hostname`, what a pod's nodeSelector matches; the node name when unlabeled. */
  hostname: string;
  /** `status.allocatable`, in bytes and millicores; absent when the node does not report it. */
  allocatable: {
    cpuMillis?: number;
    memoryBytes?: number;
    storageBytes?: number;
  };
  /** The `alloydb.net/*` labels and the zone, for the admin view. */
  labels: Record<string, string>;
}

const BINARY = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
} as const;
const DECIMAL = { k: 1e3, M: 1e6, G: 1e9, T: 1e12 } as const;

/** Kubernetes quantity ("100Gi", "490934772Ki", "8", "7910m") as a number; null when unreadable. */
export function parseQuantity(raw: string | undefined): number | null {
  const match = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|k|M|G|T|m)?$/.exec(raw ?? '');
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  const unit = match[2];
  if (unit === undefined) return value;
  if (unit === 'm') return value / 1000;
  return (
    value *
    (unit in BINARY
      ? BINARY[unit as keyof typeof BINARY]
      : DECIMAL[unit as keyof typeof DECIMAL])
  );
}

/** The node as the platform sees it, or the reason it is skipped. */
export function parseNode(node: V1Node): ParsedNode | string {
  const name = node.metadata?.name ?? '(unnamed)';
  const rawId = node.metadata?.labels?.[LABEL_NODE_ID];
  const id = Number(rawId);
  if (!rawId || !Number.isInteger(id) || id <= 0) {
    return `${name}: label ${LABEL_NODE_ID} is missing or not a positive integer`;
  }
  const annotated = node.metadata?.annotations?.[ANNOTATION_TAILSCALE_IP];
  const internal = node.status?.addresses?.find(
    (a) => a.type === 'InternalIP',
  )?.address;
  const tailscaleIp = annotated ?? internal;
  if (!tailscaleIp || !(IPV4.test(tailscaleIp) || tailscaleIp.includes(':'))) {
    return `${name}: no Tailscale address (InternalIP or ${ANNOTATION_TAILSCALE_IP})`;
  }
  const labels = node.metadata?.labels ?? {};
  const allocatable = node.status?.allocatable ?? {};
  const cpu = parseQuantity(allocatable.cpu);
  const memory = parseQuantity(allocatable.memory);
  const storage = parseQuantity(allocatable['ephemeral-storage']);
  return {
    id,
    name,
    tailscaleIp,
    zone: labels['topology.kubernetes.io/zone'] ?? 'unknown',
    roles: ROLES.filter((role) => labels[`alloydb.net/${role}`] === 'true'),
    ready:
      node.status?.conditions?.find((c) => c.type === 'Ready')?.status ===
      'True',
    hostname: labels['kubernetes.io/hostname'] ?? name,
    allocatable: {
      ...(cpu === null ? {} : { cpuMillis: Math.round(cpu * 1000) }),
      ...(memory === null ? {} : { memoryBytes: Math.round(memory) }),
      ...(storage === null ? {} : { storageBytes: Math.round(storage) }),
    },
    labels: Object.fromEntries(
      Object.entries(labels).filter(
        ([key]) =>
          key.startsWith('alloydb.net/') ||
          key === 'topology.kubernetes.io/zone',
      ),
    ),
  };
}

/** One sync pass. Returns the ids written and the nodes skipped, with reasons. */
export async function syncNodes(
  source: NodeSource,
  store: NeonStore,
  logger: { warn(message: string): void } = console,
): Promise<{ synced: number[]; skipped: string[] }> {
  const synced: number[] = [];
  const skipped: string[] = [];
  const seen = new Map<number, string>();
  for (const item of (await source.listNode()).items) {
    const parsed = parseNode(item);
    if (typeof parsed === 'string') {
      // A node without the label is not ours (a control-plane-only or
      // third-party node); say so quietly.
      skipped.push(parsed);
      continue;
    }
    const clash = seen.get(parsed.id);
    if (clash) {
      const message = `${parsed.name}: node id ${parsed.id} is already used by ${clash}`;
      logger.warn(message);
      skipped.push(message);
      continue;
    }
    seen.set(parsed.id, parsed.name);
    await store.upsertNode({
      id: parsed.id,
      name: parsed.name,
      tailscaleIp: parsed.tailscaleIp,
      zone: parsed.zone,
      addRoles: [],
      roles: parsed.roles,
      capacity: {
        ready: parsed.ready,
        missing: false,
        hostname: parsed.hostname,
        allocatable: parsed.allocatable,
        labels: parsed.labels,
      },
    });
    synced.push(parsed.id);
  }
  // A node that left the cluster keeps its row (databases and safekeepers may
  // still refer to it) but must not receive new work.
  for (const row of await store.listNodes()) {
    if (synced.includes(row.id) || row.capacity.missing === true) continue;
    await store.upsertNode({
      id: row.id,
      name: row.name,
      tailscaleIp: row.tailscaleIp,
      zone: row.zone,
      addRoles: [],
      capacity: { ready: false, missing: true },
    });
  }
  return { synced, skipped };
}
