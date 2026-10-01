import { safekeeperRegistration } from './safekeepers.js';
import type { StorconClient } from './storcon-client.js';
import type { NeonStore } from './store.js';

/**
 * Keeps the storage controller's view of the cluster in line with ours. Both
 * jobs are idempotent and cheap, so the worker repeats them on a timer instead
 * of reacting to node changes.
 */

/**
 * Safekeepers do not register themselves (docs-internal/platform/architecture.mdx),
 * so the worker upserts each one by id with its headless-Service name, then moves
 * it from `Activating` to `Active`. Safekeepers an operator paused or
 * decommissioned keep that policy.
 */
export async function registerSafekeepers(
  storcon: StorconClient,
  count: number,
): Promise<{ upserted: number[]; activated: number[] }> {
  const existing = new Map(
    (await storcon.listSafekeepers()).map((sk) => [sk.id, sk]),
  );
  const upserted: number[] = [];
  const activated: number[] = [];
  for (let id = 1; id <= count; id++) {
    const want = safekeeperRegistration(id);
    const have = existing.get(id);
    const current =
      have &&
      have.host === want.host &&
      have.port === want.port &&
      have.http_port === want.http_port &&
      have.availability_zone_id === want.availability_zone_id;
    if (!current) {
      await storcon.upsertSafekeeper(want);
      upserted.push(id);
    }
    // A safekeeper that was just created starts out Activating.
    if ((have?.scheduling_policy ?? 'Activating') === 'Activating') {
      await storcon.setSafekeeperSchedulingPolicy(id, 'Active');
      activated.push(id);
    }
  }
  return { upserted, activated };
}

/**
 * Pageservers register themselves with the controller on start. Copy what it
 * knows into the `node` table: its id is `ALLOYDB_NODE_ID`, and the address it
 * registered is the node's Tailscale IP (architecture.mdx, "Storage controller").
 */
export async function discoverPageservers(
  storcon: StorconClient,
  store: NeonStore,
): Promise<number[]> {
  const nodes = await storcon.listNodes();
  for (const node of nodes) {
    await store.upsertNode({
      id: node.id,
      name: `pageserver-${node.id}`,
      tailscaleIp: node.listen_pg_addr,
      zone: node.availability_zone_id,
      addRoles: ['pageserver'],
      registeredPageserver: true,
    });
  }
  return nodes.map((n) => n.id);
}
