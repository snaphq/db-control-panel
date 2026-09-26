import {
  getCurrentMcpContext,
  registerMcpTool,
  wrapToolHandler,
} from "@repo/mcp-chatgpt";
import type { McpServer } from "./types";

/**
 * Account tools let an agent confirm which site and tenant it is connected to
 * and with which credential, before it acts. They only echo the request
 * context the route already authenticated.
 */
export function registerAccountTools(
  server: McpServer,
  config: { siteName: string },
): void {
  registerMcpTool(
    server,
    "whoami",
    {
      description:
        "Return the site, tenant, and credential this MCP connection is authenticated as.",
    },
    wrapToolHandler("whoami", async () => {
      const ctx = getCurrentMcpContext();
      const identity = {
        site: config.siteName,
        tenantId: ctx?.tenantId ?? null,
        actorType: ctx?.actorType ?? null,
        actorName: ctx?.actorName ?? null,
        authMethod: ctx?.authMethod ?? null,
        scopes: ctx?.scopes ?? [],
        organizations:
          ctx?.operator?.organizations.map((org) => ({
            slug: org.slug,
            name: org.name,
            role: org.role,
          })) ?? [],
      };
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(identity, null, 2) },
        ],
      };
    }),
  );
}
