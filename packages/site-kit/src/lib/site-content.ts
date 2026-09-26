import { normalizePathname } from "@repo/core/site-config";
import { blog, docsSource } from "@site/lib/source";

// Site-owned public content (docs mirror + blog) used by the sitemap and the
// agent-discovery markdown twins. Lives with the site because the content
// collections are generated per site by fumadocs.
const publicStaticPaths = [
  "/",
  "/blog",
  "/docs",
  "/help",
  "/privacy",
  "/terms",
  "/changelog",
  "/marketing-page",
] as const;

export function getPublicDocsPaths(): string[] {
  return docsSource
    .generateParams()
    .map((params) => `/docs/${params.slug?.join("/") ?? ""}`)
    .map(normalizePathname);
}

export function getPublicBlogPaths(): string[] {
  return blog.map((post) => `/blog/${post.info.path.replace(/\.mdx$/, "")}`);
}

export function getSitemapPaths(): string[] {
  return [
    ...publicStaticPaths,
    ...getPublicDocsPaths(),
    ...getPublicBlogPaths(),
  ];
}
