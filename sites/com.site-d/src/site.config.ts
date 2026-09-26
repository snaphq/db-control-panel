import type { StandaloneSiteConfig } from "@repo/site-kit/site-config";

/**
 * Identity of this tenant site.
 *
 * This site is `stack: "standalone"`: it runs Astro and does not consume the
 * shared @repo/site-kit route tree, so it has no agent markdown and no MCP
 * endpoint. `bun run db:seed:sites` reads the tenant fields below and creates
 * or updates the matching `tenant` and primary `tenant_domain` rows in the
 * shared database.
 *
 * The `StandaloneSiteConfig` import is type-only and is resolved through a
 * tsconfig path mapping rather than a package dependency. That is deliberate:
 * this package must NOT list `@repo/site-kit` in its dependencies, because
 * scripts/sync-site-routes.ts selects sites to generate Next.js route shims
 * for by exactly that dependency, and would otherwise write a Next App Router
 * tree into an Astro app.
 */
export const siteConfig: StandaloneSiteConfig = {
  stack: "standalone",
  id: "com.site-d",
  tenantId: "site-d",
  tenantSlug: "site-d",
  name: "Site D",
  description: "Astro tenant site for the Site D tenant",
  domain: "starter-astro-stack.vercel.app",
  publicPaths: ["/"],
};
