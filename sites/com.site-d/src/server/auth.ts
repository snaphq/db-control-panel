import {
  getBetterAuthServer,
  runWithAuthTenantContext,
} from "@repo/auth/server";
import { resourceUrlForRequest } from "@repo/core/agent-auth/discovery";
import type { Tenant } from "@repo/database";

/**
 * Better Auth's routes under /api/auth/*, shared by src/pages/api/auth.
 *
 * The handler runs inside `runWithAuthTenantContext`, which the shared auth
 * adapter requires: withTenantBoundAuthAdapter throws on any tenant-bound
 * read or write that has no tenant context, so mounting the raw handler would
 * fail on the first sign-in rather than quietly mis-scoping it. `resource` is
 * the tenant's own /mcp URL, the same value the Next.js sites bind.
 *
 * `cookieDelivery: "response"` drops Better Auth's `nextCookies` plugin,
 * which exists only to re-apply Set-Cookie through Next's `cookies()` API.
 * Astro returns the Response as-is, so the browser receives the headers
 * directly.
 *
 * The instance is created once per process and is tenant-agnostic: the
 * context above scopes every operation to the request's tenant.
 */
export function handleAuth(
  tenant: Tenant,
  request: Request,
): Promise<Response> {
  return runWithAuthTenantContext(
    { tenantId: tenant.id, resource: resourceUrlForRequest(request) },
    () =>
      getBetterAuthServer({ cookieDelivery: "response" })
        .getAuthInstance()
        .handler(request),
  );
}
