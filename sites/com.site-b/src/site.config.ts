import type { SiteConfig } from "@repo/site-kit/site-config";

// Identity of this tenant site. Imported by next.config.ts, so keep it free of
// runtime imports (type imports only).
export const siteConfig: SiteConfig = {
  id: "com.site-b",
  tenantId: "site-b",
  tenantSlug: "site-b",
  name: "Site B",
  description: "A second tenant site sharing the same platform.",
  domain: "site-b.example.com",
  publicPaths: ["/", "/privacy", "/terms"],
  markdown: {
    "/": [
      "# Site B",
      "",
      "A second tenant site sharing the same platform.",
      "",
      "## Key sections",
      "- Workspaces, billing, and integrations",
      "- MCP server for AI agents",
    ].join("\n"),
    "/privacy": "# Privacy Policy\n\nHow Site B handles your data.",
    "/terms": "# Terms\n\nTerms of service for Site B.",
  },
  mcp: {
    serverName: "site-b-mcp",
    toolsets: ["account"],
  },
};
