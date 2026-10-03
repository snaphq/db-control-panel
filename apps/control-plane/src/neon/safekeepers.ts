/**
 * Safekeeper naming (docs-internal/platform/architecture.mdx). The control
 * plane runs each safekeeper as its own StatefulSet `safekeeper-<id>` with one
 * replica, behind a Service of the same name in namespace `neon`. Ids start at 1,
 * come from the `safekeeper` table's identity column and are never reused; each
 * safekeeper is its own logical availability zone `az-<id>`, so the storage
 * controller's rule that a timeline's safekeepers sit in distinct zones
 * (`safekeepers_for_new_timeline`, service/safekeeper_service.rs:697-760) holds
 * on any number of nodes.
 */

export const SAFEKEEPER_NAMESPACE = 'neon';
export const SAFEKEEPER_PG_PORT = 5454;
export const SAFEKEEPER_HTTP_PORT = 7676;

function checkId(id: number): number {
  if (!Number.isInteger(id) || id < 1) {
    throw new Error(`Safekeeper ids start at 1, got ${id}`);
  }
  return id;
}

/** Name of the safekeeper's StatefulSet and Service. */
export const safekeeperName = (id: number): string =>
  `safekeeper-${checkId(id)}`;

/** The logical availability zone of safekeeper `id`. */
export const safekeeperAz = (id: number): string => `az-${checkId(id)}`;

/**
 * DNS name of safekeeper `id`: its own Service, which keeps the address when
 * the pod restarts or is rescheduled.
 */
export function safekeeperHostname(id: number): string {
  return `${safekeeperName(id)}.${SAFEKEEPER_NAMESPACE}.svc.cluster.local`;
}

/** The registration body for safekeeper `id` (`SafekeeperUpsert` in storcon-client.ts). */
export function safekeeperRegistration(id: number) {
  return {
    id,
    region_id: safekeeperAz(id),
    // 1 means "just created, not yet posted to the controller" (persistence.rs:2522).
    version: 1,
    host: safekeeperHostname(id),
    port: SAFEKEEPER_PG_PORT,
    http_port: SAFEKEEPER_HTTP_PORT,
    availability_zone_id: safekeeperAz(id),
  };
}
