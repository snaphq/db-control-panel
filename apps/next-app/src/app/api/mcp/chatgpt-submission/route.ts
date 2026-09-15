import {
  type ChatGPTAppInfo,
  MCP_TOOL_METADATA,
  type McpToolName,
  generateChatGPTSubmission,
} from "@repo/mcp-chatgpt";

/**
 * GET /api/mcp/chatgpt-submission
 *
 * Dynamically generates the ChatGPT app submission manifest from the
 * central MCP_TOOL_METADATA registry. Admin-only tools are excluded so
 * only the public-facing widget tools appear in the submission.
 *
 * Override app info via environment variables:
 *   CHATGPT_APP_DISPLAY_NAME  (default: "NextJS Starter MCP")
 *   CHATGPT_APP_SUBTITLE      (default: placeholder)
 *   CHATGPT_APP_DESCRIPTION   (default: placeholder)
 *   CHATGPT_APP_CATEGORY      (default: "PRODUCTIVITY")
 */

// Admin tool names — excluded from the public ChatGPT submission.
// Listed explicitly so renames are caught at startup by getMcpToolAnnotations.
const ADMIN_TOOL_NAMES: McpToolName[] = [
  "get_admin_stats",
  "get_user_by_email",
  "get_user_by_id",
  "list_users",
  "list_organizations",
  "get_active_sessions",
  "get_organization_by_id",
];

function getAppInfo(): ChatGPTAppInfo {
  return {
    displayName: process.env.CHATGPT_APP_DISPLAY_NAME ?? "NextJS Starter MCP",
    subtitle:
      process.env.CHATGPT_APP_SUBTITLE ??
      "If you are seeing this, replace the subtitle",
    description:
      process.env.CHATGPT_APP_DESCRIPTION ?? "Set the description please",
    category: process.env.CHATGPT_APP_CATEGORY ?? "PRODUCTIVITY",
  };
}

function getCacheHeader(): string {
  return process.env.NODE_ENV === "production"
    ? "public, max-age=3600, s-maxage=3600"
    : "no-store";
}

export async function GET(): Promise<Response> {
  // Verify all excluded tools exist in the registry to catch renames early
  for (const name of ADMIN_TOOL_NAMES) {
    if (!MCP_TOOL_METADATA[name]) {
      return Response.json(
        { error: `Unknown tool "${name}" in admin exclusion list` },
        { status: 500 },
      );
    }
  }

  const submission = generateChatGPTSubmission(getAppInfo(), {
    excludeTools: ADMIN_TOOL_NAMES,
  });

  return Response.json(submission, {
    headers: { "Cache-Control": getCacheHeader() },
  });
}
