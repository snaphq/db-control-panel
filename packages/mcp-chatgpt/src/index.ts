// Tool metadata registry
export {
  assertExplicitToolHints,
  getMcpToolAnnotations,
  MCP_TOOL_METADATA,
  MCP_TOOL_NAMES,
} from "./tool-metadata";
export type {
  McpToolAnnotations,
  McpToolJustifications,
  McpToolMetadata,
  McpToolName,
} from "./tool-metadata";

// Tool registration wrapper
export { registerMcpTool } from "./register-tool";

// Request context (AsyncLocalStorage)
export { getCurrentMcpContext, runWithMcpContext } from "./request-context";
export type { McpRequestContext } from "./request-context";

// Structured logging
export {
  logMcpRequest,
  logMcpResponse,
  logMcpToolCall,
  logMcpToolResponse,
  registerMcpLogFallback,
  sanitizeHeaders,
} from "./logger";
export type { McpEventType, McpLogEntry, McpLogFallback } from "./logger";

// Tool handler wrapper
export { wrapToolHandler } from "./tool-wrapper";

// ChatGPT submission manifest generator
export { generateChatGPTSubmission } from "./submission";
export type {
  ChatGPTAppInfo,
  ChatGPTSubmission,
  ChatGPTTestCase,
} from "./submission";
