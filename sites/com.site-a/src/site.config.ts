import type { SiteConfig } from "@repo/site-kit/site-config";

// Identity of this tenant site. Imported by next.config.ts, so keep it free of
// runtime imports (type imports only).
export const siteConfig: SiteConfig = {
  id: "com.site-a",
  tenantId: "default",
  tenantSlug: "default",
  name: "Nextjs Starter Kit",
  description: "Build your next SAAS product",
  domain: "nextjs-starter-kit-app.vercel.app",
  publicPaths: [
    "/",
    "/help",
    "/privacy",
    "/terms",
    "/changelog",
    "/marketing-page",
  ],
  markdown: {
    "/": [
      "# Nextjs Starter Kit",
      "",
      "Build a SAAS with a solid foundation.",
      "",
      "## Key sections",
      "- Authentication and onboarding",
      "- Billing and Stripe integration",
      "- Workspace dashboards",
      "- Blog and docs publishing",
      "- MCP and AI-agent integration",
    ].join("\n"),
    "/help": "# Help\n\nSupport and self-serve guidance.",
    "/privacy": "# Privacy Policy\n\nPrivacy and data handling information.",
    "/terms": "# Terms\n\nTerms and conditions for the product.",
    "/changelog": "# Changelog\n\nRecent product changes.",
    "/marketing-page": "# Marketing Page\n\nAlternative public marketing page.",
  },
};
