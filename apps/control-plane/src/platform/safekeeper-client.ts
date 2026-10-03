import type { Ed25519Signer } from '../crypto/ed25519.js';
import {
  SAFEKEEPER_HTTP_PORT,
  safekeeperHostname,
} from '../neon/safekeepers.js';
import { mintStorageToken } from '../neon/tokens.js';

export interface SafekeeperTimeline {
  tenantId: string;
  timelineId: string;
}

/** Reads from a safekeeper's own management API. */
export interface SafekeeperApi {
  /** Every timeline the safekeeper still holds. Throws when it cannot be reached. */
  listTimelines(id: number): Promise<SafekeeperTimeline[]>;
}

export interface SafekeeperApiOptions {
  signer: Ed25519Signer;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * `GET /v1/tenant/timeline` on the safekeeper's HTTP port lists the timelines it
 * has not deleted or excluded (safekeeper/src/http/routes.rs:149-159, route
 * :762); a timeline leaves the list once the node is excluded from it
 * (`delete_or_exclude`, safekeeper/src/timelines_global_map.rs:538-620). The
 * storage controller has no such listing, so this is how the control plane knows
 * a safekeeper is empty before it decommissions it. The route needs a token of
 * scope `safekeeperdata`; `admin` is refused (safekeeper/src/auth.rs:18-30), so
 * the control plane mints one with its signing key.
 */
export function createSafekeeperApi(
  options: SafekeeperApiOptions,
): SafekeeperApi {
  const doFetch = options.fetch ?? fetch;
  return {
    async listTimelines(id) {
      const url = `http://${safekeeperHostname(id)}:${SAFEKEEPER_HTTP_PORT}/v1/tenant/timeline`;
      const response = await doFetch(url, {
        headers: {
          authorization: `Bearer ${mintStorageToken(options.signer, { scope: 'safekeeperdata' })}`,
        },
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(
          `Safekeeper ${id} answered ${response.status} to ${url}: ${(await response.text()).slice(0, 200)}`,
        );
      }
      const body: unknown = await response.json();
      if (!Array.isArray(body)) {
        throw new Error(
          `Safekeeper ${id} returned a timeline list that is not an array`,
        );
      }
      return body.map(
        (entry: { tenant_id?: unknown; timeline_id?: unknown }) => {
          if (
            typeof entry.tenant_id !== 'string' ||
            typeof entry.timeline_id !== 'string'
          ) {
            throw new Error(
              `Safekeeper ${id} returned a malformed timeline entry`,
            );
          }
          return { tenantId: entry.tenant_id, timelineId: entry.timeline_id };
        },
      );
    },
  };
}
