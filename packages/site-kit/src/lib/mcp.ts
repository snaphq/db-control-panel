import { MCP_SERVER_INFO } from "@repo/core/mcp-server-info";
import { siteConfig } from "@site/site.config";

/** MCP serverInfo for this site: its own name, the shared server version. */
export function siteMcpServerInfo() {
  return { name: siteConfig.mcp.serverName, version: MCP_SERVER_INFO.version };
}
