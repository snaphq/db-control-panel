import { Hono } from "hono";

/**
 * Hono app mounted under /api by src/http/tenant-guard.ts.
 *
 * Only /api/* is routed here; every other path falls through to the SolidStart
 * file-system routes in src/routes.
 */
export const api = new Hono().basePath("/api");

api.get("/health", (c) =>
  c.json({
    status: "ok",
    site: "com.site-c",
  }),
);
