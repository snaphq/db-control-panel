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
  return {
    id,
    name,
    tailscaleIp,
    zone: labels['topology.kubernetes.io/zone'] ?? 'unknown',
    roles: ROLES.filter((role) => labels[`alloydb.net/${role}`] === 'true'),
    ready:
      node.status?.conditions?.find((c) => c.type === 'Ready')?.status ===
      'True',
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
      capacity: { ready: parsed.ready },
    });
    synced.push(parsed.id);
  }
  return { synced, skipped };
}
