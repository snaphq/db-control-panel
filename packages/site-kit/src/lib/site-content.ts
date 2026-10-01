import { normalizePathname } from "@repo/core/site-config";
import { docsSource } from "@site/lib/source";
import { siteConfig } from "@site/site.config";

// Public content for the current site: its own static pages (from
// site.config.ts) plus the docs mirror generated per site by fumadocs. Used by
// the sitemap and the agent-discovery markdown twins.
export function getPublicDocsPaths(): string[] {
  return docsSource
    .generateParams()
    .map((params) => `/docs/${params.slug?.join("/") ?? ""}`)
    .map(normalizePathname);
}

export function getSitemapPaths(): string[] {
  return [...siteConfig.publicPaths, "/docs", ...getPublicDocsPaths()];
}
