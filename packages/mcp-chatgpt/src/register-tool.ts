import type {
  McpServer,
  ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  AnySchema,
  ZodRawShapeCompat,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { ZodRawShape } from "zod";
import { type McpToolName, getMcpToolAnnotations } from "./tool-metadata";

/**
 * Registers an MCP tool on the server, automatically injecting the tool's
 * annotations from the central metadata registry.
 *
 * This wrapper ensures every registered tool has explicit readOnlyHint,
 * openWorldHint, and destructiveHint values — enforced at startup via
 * `assertExplicitToolHints`. If the tool name is not in `MCP_TOOL_METADATA`,
 * an error is thrown before the server starts.
 */
export function registerMcpTool<Args extends ZodRawShape>(
  server: McpServer,
  name: McpToolName,
  config: {
    title?: string;
    description?: string;
    inputSchema?: Args;
    outputSchema?: ZodRawShapeCompat | AnySchema;
    _meta?: Record<string, unknown>;
  },
  handler: ToolCallback<Args>,
): void {
  const annotations = getMcpToolAnnotations(name);

  server.registerTool(
    name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema,
      outputSchema: config.outputSchema,
      annotations,
      ...(config._meta ? { _meta: config._meta } : {}),
    },
    handler as ToolCallback<Args>,
  );
}
