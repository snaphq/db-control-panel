import { getSession } from "@repo/auth/server";

/**
 * Session for the current request, or null for anonymous visitors.
 *
 * @repo/auth re-resolves the tenant from the same Host header the request
 * guard used and rejects any session bound to a different tenant, so the
 * result is already scoped to `Astro.locals.tenant` without a second lookup
 * here.
 */
export function getSessionFromRequest(request: Request) {
  return getSession(request.headers);
}
