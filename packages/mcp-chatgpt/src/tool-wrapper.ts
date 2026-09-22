import { logMcpToolCall, logMcpToolResponse } from "./logger";

/**
 * Wraps a tool handler with structured MCP logging.
 *
 * Logs `mcp_tool_call` before the handler runs and `mcp_tool_response` (or
 * `mcp_error` on failure) after, including wall-clock duration. Both log
 * events are fire-and-forget; they go to Axiom when configured, and operator
 * entries fall back to the host-registered sink otherwise.
 *
 * The request context (requestId, userId, orgId) is read automatically from
 * AsyncLocalStorage — callers do not need to pass it explicitly.
 */
export function wrapToolHandler<Args, Result>(
  toolName: string,
  handler: (args: Args) => Promise<Result>,
): (args: Args) => Promise<Result> {
  return async (args: Args): Promise<Result> => {
    const start = Date.now();

    logMcpToolCall(toolName, args);

    try {
      const result = await handler(args);
      logMcpToolResponse(toolName, { success: true }, Date.now() - start);
      return result;
    } catch (err) {
      logMcpToolResponse(
        toolName,
        null,
        Date.now() - start,
        err instanceof Error ? err : new Error(String(err)),
      );
      throw err;
    }
  };
}
