import { absoluteUrl, normalizePathname, sha256 } from "@repo/core/site-config";
import { blog, docsSource } from "@site/lib/source";
import { siteConfig } from "@site/site.config";
import { getPublicBlogPaths, getPublicDocsPaths } from "./site-content";

export function isMarkdownRequest(request: Request): boolean {
  return request.headers.get("accept")?.includes("text/markdown") ?? false;
}

export function isPublicMarkdownPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);

  if (
    normalized.startsWith("/api") ||
    normalized.startsWith("/auth") ||
    normalized.startsWith("/dashboard") ||
    normalized.startsWith("/account") ||
    normalized.startsWith("/consent") ||
    normalized.startsWith("/_next")
  ) {
    return false;
  }

  return new Set([
    ...siteConfig.publicPaths,
    "/blog",
    "/docs",
    ...getPublicBlogPaths(),
    ...getPublicDocsPaths(),
  ]).has(normalized);
}

export function getMarkdownContent(pathname: string): string | null {
  const normalized = normalizePathname(pathname);

  if (normalized === "/") {
    return [
      siteConfig.markdown["/"] ??
        `# ${siteConfig.name}\n\n${siteConfig.description}`,
      "",
      `Docs: ${absoluteUrl("/docs")}`,
      `Blog: ${absoluteUrl("/blog")}`,
      `Get started: ${absoluteUrl("/auth/sign-in")}`,
    ].join("\n");
  }

  if (normalized === "/blog") {
    return [
      "# Blog",
      "",
      "Explore the latest blog posts on this site.",
      "",
      ...blog
        .slice()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .map((post) => {
          const slug = post.info.path.replace(/\.mdx$/, "");
          return `- [${post.title}](${absoluteUrl(`/blog/${slug}`)}): ${post.excerpt ?? ""}`;
        }),
    ].join("\n");
  }

  if (normalized.startsWith("/blog/")) {
    const slug = normalized.replace("/blog/", "");
    const post = blog.find(
      (entry) => entry.info.path.replace(/\.mdx$/, "") === slug,
    );
    if (!post) return null;

    return [
      `# ${post.title}`,
      "",
      `URL: ${absoluteUrl(normalized)}`,
      `Date: ${post.date}`,
      post.author ? `Author: ${post.author}` : null,
      "",
      post.excerpt ?? "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (normalized === "/docs") {
    const docLinks = docsSource
      .generateParams()
      .map((params) => {
        const path = `/docs/${params.slug?.join("/") ?? ""}`;
        const page = docsSource.getPage(params.slug);
        return page
          ? `- [${page.data.title ?? path}](${absoluteUrl(path)}): ${page.data.description ?? ""}`
          : null;
      })
      .filter(Boolean);

    return ["# Documentation", "", ...docLinks].join("\n");
  }

  if (normalized.startsWith("/docs/")) {
    const slug = normalized.replace(/^\/docs\//, "").split("/");
    const page = docsSource.getPage(slug);
    if (!page) return null;

    return [
      `# ${page.data.title ?? "Documentation"}`,
      "",
      page.data.description ?? "",
      "",
      `URL: ${absoluteUrl(normalized)}`,
    ].join("\n");
  }

  return siteConfig.markdown[normalized] ?? null;
}

export function createLinkHeader(pathname: string): string {
  const normalized = normalizePathname(pathname);
  const markdownUrl = normalized === "/" ? "/" : normalized;

  return [
    `</.well-known/api-catalog>; rel="api-catalog"`,
    `</docs>; rel="service-doc"`,
    `<${markdownUrl}>; rel="alternate"; type="text/markdown"`,
  ].join(", ");
}

function documentEntry(
  name: string,
  description: string,
  path: string,
  origin = absoluteUrl("/"),
) {
  const url = new URL(path, origin).toString();
  return {
    name,
    type: "documentation",
    media_type: "text/markdown",
    description,
    url,
    sha256: sha256(getAgentDocument(name, description, url)),
  };
}

export function getAgentDocument(
  name: string,
  description: string,
  url: string,
): string {
  return [`# ${name}`, "", description, "", `Reference: ${url}`].join("\n");
}

/**
 * Application documentation for agents. This is intentionally not an MCP
 * skills catalog: the MCP skills extension (`skills/list`, `skills/get`,
 * `skill://`, and `resources/read`) is not implemented by this server.
 */
export function getAgentDocumentationIndex(origin = absoluteUrl("/")) {
  return {
    version: 1,
    type: "documentation-index",
    documents: [
      documentEntry(
        "sitemap",
        "Describes how sitemap.xml is generated for canonical public URLs.",
        "/.well-known/agent-docs/sitemap",
        origin,
      ),
      documentEntry(
        "link-headers",
        "Describes Link headers published for agent discovery.",
        "/.well-known/agent-docs/link-headers",
        origin,
      ),
      documentEntry(
        "markdown-negotiation",
        "Describes markdown content negotiation for public pages.",
        "/.well-known/agent-docs/markdown-negotiation",
        origin,
      ),
      documentEntry(
        "content-signals",
        "Describes AI content preferences advertised via robots.txt.",
        "/.well-known/agent-docs/content-signals",
        origin,
      ),
      documentEntry(
        "api-catalog",
        "Describes the RFC 9727 API catalog published by the app.",
        "/.well-known/agent-docs/api-catalog",
        origin,
      ),
      documentEntry(
        "oauth-discovery",
        "Describes OIDC and OAuth discovery endpoints exposed by the app.",
        "/.well-known/agent-docs/oauth-discovery",
        origin,
      ),
      documentEntry(
        "oauth-protected-resource",
        "Describes OAuth protected resource metadata for authenticated APIs.",
        "/.well-known/agent-docs/oauth-protected-resource",
        origin,
      ),
      documentEntry(
        "mcp-server-card",
        "Describes the MCP server card published for the authenticated MCP endpoint.",
        "/.well-known/agent-docs/mcp-server-card",
        origin,
      ),
      documentEntry(
        "webmcp",
        "Describes WebMCP tools exposed to supporting browsers.",
        "/.well-known/agent-docs/webmcp",
        origin,
      ),
    ],
  };
}
