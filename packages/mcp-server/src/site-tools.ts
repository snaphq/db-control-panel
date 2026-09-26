import { registerAccountTools } from "./account-tools";
import type { McpServer, WidgetConfig } from "./types";
import { registerWidgetTools } from "./widget-tools";

/**
 * Toolsets a tenant site can expose on its /mcp endpoint. Each site picks a
 * subset in its site.config.ts; admin tools are never available here (they
 * live on the apps/backend MCP endpoint).
 */
export const SITE_MCP_TOOLSETS = ["content", "account"] as const;
export type SiteMcpToolset = (typeof SITE_MCP_TOOLSETS)[number];

export interface SiteToolsConfig {
  siteName: string;
  toolsets: readonly SiteMcpToolset[];
  /** Register only tools annotated `readOnlyHint: true` (demo/sandbox sites). */
  readOnly?: boolean;
  widget: WidgetConfig;
}

/**
 * A view of `server` that silently drops tools not annotated read-only, so a
 * read-only site never advertises or serves a mutating tool.
 */
function readOnlyView(server: McpServer): McpServer {
  return new Proxy(server, {
    get(target, property) {
      if (property === "registerTool") {
        // registerTool is heavily overloaded; forward the arguments untouched.
        const registerTool = target.registerTool.bind(target) as (
          ...args: unknown[]
        ) => unknown;
        return (
          name: string,
          config: { annotations?: { readOnlyHint?: boolean } },
          ...rest: unknown[]
        ) => {
          if (config.annotations?.readOnlyHint !== true) return undefined;
          return registerTool(name, config, ...rest);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export async function registerSiteTools(
  server: McpServer,
  config: SiteToolsConfig,
): Promise<void> {
  const target = config.readOnly ? readOnlyView(server) : server;
  for (const toolset of new Set(config.toolsets)) {
    switch (toolset) {
      case "content":
        await registerWidgetTools(target, config.widget);
        break;
      case "account":
        registerAccountTools(target, { siteName: config.siteName });
        break;
      default: {
        const unknown: never = toolset;
        throw new Error(`Unknown MCP toolset: ${String(unknown)}`);
      }
    }
  }
}
