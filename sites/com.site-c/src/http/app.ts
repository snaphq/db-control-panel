import { getBetterAuthServer } from "@repo/auth/server";
import { runWithAuthTenantContext } from "@repo/auth/server";
import { resourceUrlForRequest } from "@repo/core/agent-auth/discovery";
import type { Tenant } from "@repo/database";
import { Hono } from "hono";

/**
 * Per-request bindings handed to the Hono app.
 *
 * `Hono.fetch(request, env)` takes the bindings as its second argument, which
 * is how the resolved tenant crosses from the h3 middleware into Hono without a
 * second lookup. It surfaces as `c.env`.
 */
export type ApiEnv = {
  tenant: Tenant;
};

/**
 * Hono app mounted under /api by src/http/tenant-guard.ts.
 *
 * Only /api/auth/* and /api/health are routed here. The dashboard read models
 * are not served over HTTP: pages read them through "use server" functions in
 * src/server/dashboard.ts, which avoids a server-side fetch to this same
 * server (Node's fetch rejects the relative URL those pages would need) and
 * saves the extra hop. The tenant still comes only from the Host header, never
 * from a client-supplied parameter.
 */
export const api = new Hono<{ Bindings: ApiEnv }>().basePath("/api");

api.get("/health", (c) =>
  c.json({
    status: "ok",
    site: "com.site-c",
  }),
);

/**
 * Better Auth's own routes, mounted for every method under /api/auth/*.
 *
 * The handler runs inside `runWithAuthTenantContext`, which the shared auth
 * adapter requires: withTenantBoundAuthAdapter throws on any tenant-bound
 * read or write that has no tenant context, so mounting the raw handler would
 * fail on the first sign-in rather than quietly mis-scoping it. `resource` is
 * the tenant's own /mcp URL, the same value the Next.js sites bind.
 *
 * `cookieDelivery: "response"` drops Better Auth's `nextCookies` plugin, which
 * exists only to re-apply Set-Cookie through Next's `cookies()` API. Hono
 * returns the Response as-is, so the browser receives the headers directly.
 *
 * The instance is created once per process and is tenant-agnostic: the context
 * above scopes every operation to the request's tenant.
 */
function handleAuth(tenant: Tenant, request: Request): Promise<Response> {
  return runWithAuthTenantContext(
    { tenantId: tenant.id, resource: resourceUrlForRequest(request) },
    () =>
      getBetterAuthServer({ cookieDelivery: "response" })
        .getAuthInstance()
        .handler(request),
  );
}

api.on(["GET", "POST", "PATCH", "PUT", "DELETE"], "/auth/*", (c) =>
  handleAuth(c.env.tenant, c.req.raw),
);

api.on(["GET", "POST", "PATCH", "PUT", "DELETE"], "/auth", (c) =>
  handleAuth(c.env.tenant, c.req.raw),
);
