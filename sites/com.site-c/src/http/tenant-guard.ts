import { createMiddleware } from "@solidjs/start/middleware";
import { api } from "./app";

/**
 * Bridges the Hono app into SolidStart's H3 middleware chain.
 *
 * `createMiddleware` takes h3 middleware, so the argument is an `H3Event`, not
 * SolidStart's `FetchEvent`. `event.req` is the incoming web `Request` — h3
 * v2 renamed `FetchEvent.request` to `H3Event.req`, and
 * `@solidjs/start/server`'s own `createFetchEvent` assigns one to the other —
 * and `event.url` is the already-parsed URL. Because Hono's `fetch()` is
 * web-standard, no adapter package is needed.
 *
 * Returning `undefined` falls through to the SolidStart file-system routes in
 * src/routes, so only /api/* is handled here.
 *
 * Named `tenant-guard.ts` rather than `middleware.ts` on purpose:
 * scripts/check-no-middleware.ts rejects any file called `middleware.*` at any
 * depth, because Next.js 16 replaced that convention with `proxy`. This site
 * is SolidStart and legitimately has request middleware.
 */
export default createMiddleware([
  async (event) => {
    if (!event.url.pathname.startsWith("/api/")) return;
    return await api.fetch(event.req);
  },
]);
