/**
 * Safekeeper naming from docs-internal/platform/architecture.mdx: a StatefulSet
 * behind the headless Service `safekeeper` in namespace `neon`. Pod ordinal `n`
 * is safekeeper id `n + 1` in availability zone `az-<n + 1>`.
 */

export const SAFEKEEPER_PG_PORT = 5454;
const SAFEKEEPER_HTTP_PORT = 7676;

/** DNS name of safekeeper `id` (1-based) through the headless Service. */
export function safekeeperHostname(id: number): string {
  if (!Number.isInteger(id) || id < 1) {
    throw new Error(`Safekeeper ids start at 1, got ${id}`);
  }
  return `safekeeper-${id - 1}.safekeeper.neon.svc.cluster.local`;
}

/** The registration body for safekeeper `id` (`SafekeeperUpsert` in storcon-client.ts). */
export function safekeeperRegistration(id: number) {
  return {
    id,
    region_id: `az-${id}`,
    // 1 means "just created, not yet posted to the controller" (persistence.rs:2522).
    version: 1,
    host: safekeeperHostname(id),
    port: SAFEKEEPER_PG_PORT,
    http_port: SAFEKEEPER_HTTP_PORT,
    availability_zone_id: `az-${id}`,
  };
}
