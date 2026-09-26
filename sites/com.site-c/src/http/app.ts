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
