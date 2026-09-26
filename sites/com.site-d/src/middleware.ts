import { resolveTenantFromHost } from "@repo/database";
/// <reference path="./env.d.ts" />
import type { APIContext } from "astro";

/**
 * Resolves the request's tenant before any page or endpoint runs.
 *
 * Two rules, both load-bearing:
 *
 * 1. An unresolvable tenant is a 404, never a fallback. Every site in this
 *    monorepo shares one database, so a request that cannot be attributed to
 *    a tenant must not be served under some default identity. In development
 *    a local host resolves through `SITE_TENANT_ID`, which .env.development
 *    pins to this site's own tenant; in production `resolveTenantFromHost`
 *    never maps a local host to a tenant at all.
 * 2. The tenant travels on `context.locals` (typed by the augmentation in
 *    env.d.ts, referenced above). Pages and endpoints read it from there and
 *    never accept one from the client.
 *
 * This file is named `middleware.ts` because Astro requires exactly that
 * filename for request middleware; the no-middleware pre-commit hook exempts
 * Astro site middleware from the Next.js middleware→proxy rename.
 */
export const onRequest = async (
  context: APIContext,
  next: () => Promise<Response>,
): Promise<Response> => {
  const tenant = await resolveTenantFromHost(
    context.request.headers.get("host"),
  );
  if (!tenant) return new Response("Not found", { status: 404 });
  context.locals.tenant = tenant;
  return next();
};
