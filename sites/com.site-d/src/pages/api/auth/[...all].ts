/// <reference path="../../../env.d.ts" />
import type { APIRoute } from "astro";
import { handleAuth } from "../../../server/auth";

/**
 * Better Auth's own routes, mounted for every method under /api/auth/*.
 *
 * The tenant was resolved from the Host header by src/middleware.ts; see
 * src/server/auth.ts for the tenant-context and cookie-delivery details.
 */
export const ALL: APIRoute = (context) =>
  handleAuth(context.locals.tenant, context.request);
