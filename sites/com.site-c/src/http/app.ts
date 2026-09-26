import { getBetterAuthServer } from "@repo/auth/server";
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
 * Only /api/* is routed here; every other path falls through to the SolidStart
 * file-system routes in src/routes.
 */
export const api = new Hono<{ Bindings: ApiEnv }>().basePath("/api");

api.get("/health", (c) =>
  c.json({
    status: "ok",
    site: "com.site-c",
  }),
);

api.get("/tenant", (c) => {
  const tenant = c.env.tenant;
  return c.json({
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    status: tenant.status,
  });
});

/**
 * Better Auth's own routes, mounted for every method under /api/auth/*.
 *
 * `cookieDelivery: "response"` drops Better Auth's `nextCookies` plugin, which
 * exists only to re-apply Set-Cookie through Next's `cookies()` API. Hono
 * returns the Response as-is, so the browser receives the headers directly.
 *
 * The instance is created once per process and is tenant-agnostic: every
 * Better Auth read and write is bound to the request's tenant by
 * withTenantBoundAuthAdapter inside @repo/auth, so one instance serves all
 * tenants safely.
 */
api.on(["GET", "POST", "PATCH", "PUT", "DELETE"], "/auth/*", (c) =>
  getBetterAuthServer({ cookieDelivery: "response" })
    .getAuthInstance()
    .handler(c.req.raw),
);

api.on(["GET", "POST", "PATCH", "PUT", "DELETE"], "/auth", (c) =>
  getBetterAuthServer({ cookieDelivery: "response" })
    .getAuthInstance()
    .handler(c.req.raw),
);
