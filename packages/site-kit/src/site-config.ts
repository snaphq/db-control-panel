/**
 * Identity and behavior of one tenant site in sites/*. Each site exports a
 * `siteConfig` from `src/site.config.ts`; shared routes read it through the
 * `@site/site.config` alias, and `bun run db:seed:sites` turns it into the
 * site's `tenant` + `tenant_domain` rows.
 */
export interface SiteConfig {
  /** Workspace folder under sites/, for example "com.site-a". */
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
  /**
   * Markdown served to agents for site-owned pages (`Accept: text/markdown`).
   * "/" is the site summary; links to docs, blog, and sign-in are appended.
   */
  markdown: Readonly<Record<string, string>>;
}
