/**
 * Identity shared by the normal MCP transport and its discovery card.
 * Keep this in one module so `initialize` and server-card metadata cannot
 * drift independently.
 */
export const MCP_SERVER_INFO = {
  name: "nextjs-starter-kit-mcp",
  version: "0.1.0",
} as const;

export const MCP_ADMIN_SERVER_INFO = {
  name: "nextjs-starter-kit-admin-mcp",
  version: "0.1.0",
} as const;
