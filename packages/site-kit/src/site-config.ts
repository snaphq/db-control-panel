import type { SiteMcpToolset } from "@repo/mcp-server/site-tools";

/**
 * Identity of one tenant site in sites/*. Each site exports a `siteConfig` from
 * `src/site.config.ts`; shared routes read it through the `@site/site.config`
 * alias, and `bun run db:seed:sites` turns it into the site's `tenant` +
 * `tenant_domain` rows.
 *
 * A site is one of two shapes. `SiteConfig` is a site built on the shared
 * @repo/site-kit route tree; `StandaloneSiteConfig` is a site that owns its own
 * routes and framework, such as com.site-c on SolidStart. Both carry the same
 * tenant identity fields, which is all `db:seed:sites` needs. Discriminate with
 * the `stack` field and narrow through `AnySiteConfig`.
 */
export interface SiteConfigBase {
  /** Workspace folder under sites/, for example "net.alloydb.console". */
  id: string;
  /** `tenant.id` this site serves. */
  tenantId: string;
  /** `tenant.slug`; unique across sites. */
  tenantSlug: string;
  /** Display name used for the tenant and in page titles. */
  name: string;
  description: string;
  /** Production host, stored as the tenant's primary `tenant_domain`. */
  domain: string;
  /** Site-owned public pages to list in the sitemap (besides /blog, /docs). */
  publicPaths: readonly string[];
}

/**
 * A site served by the shared @repo/site-kit route tree. `stack` stays optional
 * so existing sites need no edit, and so `scripts/sync-site-routes.ts` can keep
 * selecting sites by their `@repo/site-kit` dependency.
 */
export interface SiteConfig extends SiteConfigBase {
  stack?: "site-kit";
  /**
   * Markdown served to agents for site-owned pages (`Accept: text/markdown`).
   * "/" is the site summary; links to docs, blog, and sign-in are appended.
   */
  markdown: Readonly<Record<string, string>>;
  /** What this site's /mcp endpoint exposes to agents. */
  mcp: {
    /** MCP `serverInfo.name`, also shown on /.well-known/mcp/server-card.json. */
    serverName: string;
    toolsets: readonly SiteMcpToolset[];
    /** Expose only read-only tools, e.g. for a public demo tenant. */
    readOnly?: boolean;
  };
}

/**
 * A site that owns its routes and framework instead of consuming
 * @repo/site-kit. It serves neither agent markdown nor /mcp, so it omits those
 * fields rather than declaring them empty.
 */
export interface StandaloneSiteConfig extends SiteConfigBase {
  stack: "standalone";
}

/** Either kind of site, discriminated by `stack`. */
export type AnySiteConfig = SiteConfig | StandaloneSiteConfig;
