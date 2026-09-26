import { resolveTenantFromHost } from "@repo/database";
import { createMiddleware } from "@solidjs/start/middleware";
import { type ApiEnv, api } from "./app";

/**
 * Resolves the request's tenant and hands the request to Hono under /api.
 *
 * Two rules, both load-bearing:
 *
 * 1. An unresolvable tenant is a 404, never a fallback. Every site in this
 *    monorepo shares one database, so a request that cannot be attributed to a
 *    tenant must not be served under some default identity. This mirrors
 *    `getCurrentTenant()` in @repo/core, which calls `notFound()`. In
 *    development a local host resolves through `SITE_TENANT_ID`, which
 *    .env.development pins to this site's own tenant; in production
 *    `resolveTenantFromHost` never maps a local host to a tenant at all.
 * 2. Only /api/* is routed to Hono. Returning undefined falls through to the
 *    SolidStart file-system routes in src/routes.
 *
 * Named `tenant-guard.ts` rather than `middleware.ts` on purpose:
 * scripts/check-no-middleware.ts rejects any file called `middleware.*` at any
 * depth, because Next.js 16 replaced that convention with `proxy`. This site
 * is SolidStart and legitimately has request middleware.
 */
export default createMiddleware([
  async (event) => {
    const tenant = await resolveTenantFromHost(event.req.headers.get("host"));
    if (!tenant) return new Response("Not found", { status: 404 });
    if (!event.url.pathname.startsWith("/api/")) return;
    return await api.fetch(event.req, { tenant } satisfies ApiEnv);
  },
]);
