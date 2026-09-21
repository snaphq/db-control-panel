/**
 * Central registry of MCP tool annotations and justifications.
 *
 * Every tool exposed via MCP — whether ChatGPT-facing widget tools or
 * internal admin tools — must have an explicit entry here. The registration
 * wrapper (`register-tool.ts`) reads from this registry and will throw at
 * startup if any required hint is missing, preventing silent misconfiguration.
 */

export interface McpToolAnnotations {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint?: boolean;
  openWorldHint: boolean;
}

export interface McpToolJustifications {
  read_only_justification: string;
  open_world_justification: string;
  destructive_justification: string;
}

export interface McpToolMetadata {
  annotations: McpToolAnnotations;
  justifications: McpToolJustifications;
}

// All known MCP tool names across mcp-server (widget + admin)
export type McpToolName =
  // Widget tools (ChatGPT-facing)
  | "show_content"
  // Admin tools
  | "get_admin_stats"
  | "search_records"
  | "get_user_by_email"
  | "get_user_by_id"
  | "list_users"
  | "list_organizations"
  | "get_active_sessions"
  | "get_organization_by_id";

export const MCP_TOOL_METADATA: Record<McpToolName, McpToolMetadata> = {
  // ─── Widget tools ─────────────────────────────────────────────────────────

  show_content: {
    annotations: {
      title: "Show Content",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    justifications: {
      read_only_justification:
        "Only fetches and renders the homepage content from the Next.js app for the given user name. No data is written.",
      open_world_justification:
        "Does not create, publish, or transmit content to external services beyond the app itself.",
      destructive_justification:
        "Does not delete, overwrite, revoke access, or perform any irreversible actions.",
    },
  },

  // ─── Admin tools ──────────────────────────────────────────────────────────

  get_admin_stats: {
    annotations: {
      title: "Get Admin Stats",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    justifications: {
      read_only_justification:
        "Only reads tenant-scoped aggregate counts of users, organizations, and active sessions from the database.",
      open_world_justification:
        "Does not transmit data to external systems or modify any public-facing state.",
      destructive_justification:
        "Does not delete, overwrite, revoke access, or perform any irreversible actions.",
    },
  },

  search_records: {
    annotations: {
      title: "Search Records",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    justifications: {
      read_only_justification:
        "Only searches tenant-scoped organization, project, or user records using bounded query input. No writes occur.",
      open_world_justification:
        "Does not transmit data to external systems or modify public-facing state.",
      destructive_justification:
        "Does not delete, overwrite, revoke access, or perform irreversible actions.",
    },
  },

  get_user_by_email: {
    annotations: {
      title: "Get User by Email",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    justifications: {
      read_only_justification:
        "Only retrieves a single user record matched by email address. No writes occur.",
      open_world_justification:
        "Does not transmit data to external systems or modify any public-facing state.",
      destructive_justification:
        "Does not delete, overwrite, revoke access, or perform any irreversible actions.",
    },
  },

  get_user_by_id: {
    annotations: {
      title: "Get User by ID",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    justifications: {
      read_only_justification:
        "Only retrieves a single user record matched by user ID. No writes occur.",
      open_world_justification:
        "Does not transmit data to external systems or modify any public-facing state.",
      destructive_justification:
        "Does not delete, overwrite, revoke access, or perform any irreversible actions.",
    },
  },

  list_users: {
    annotations: {
      title: "List Users",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    justifications: {
      read_only_justification:
        "Only reads a paginated list of user records ordered by creation date. No writes occur.",
      open_world_justification:
        "Does not transmit data to external systems or modify any public-facing state.",
      destructive_justification:
        "Does not delete, overwrite, revoke access, or perform any irreversible actions.",
    },
  },

  list_organizations: {
    annotations: {
      title: "List Organizations",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    justifications: {
      read_only_justification:
        "Only reads a paginated list of organization records ordered by creation date. No writes occur.",
      open_world_justification:
        "Does not transmit data to external systems or modify any public-facing state.",
      destructive_justification:
        "Does not delete, overwrite, revoke access, or perform any irreversible actions.",
    },
  },

  get_active_sessions: {
    annotations: {
      title: "Get Active Sessions",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    justifications: {
      read_only_justification:
        "Only reads active session records where the expiry is in the future. No writes occur.",
      open_world_justification:
        "Does not transmit session data to external systems or modify any public-facing state.",
      destructive_justification:
        "Does not revoke, invalidate, or terminate any sessions.",
    },
  },

  get_organization_by_id: {
    annotations: {
      title: "Get Organization by ID",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    justifications: {
      read_only_justification:
        "Only retrieves a single organization record matched by ID. No writes occur.",
      open_world_justification:
        "Does not transmit data to external systems or modify any public-facing state.",
      destructive_justification:
        "Does not delete, overwrite, revoke access, or perform any irreversible actions.",
    },
  },
};

export const MCP_TOOL_NAMES = Object.keys(MCP_TOOL_METADATA) as McpToolName[];

function assertHintBooleans(
  toolName: string,
  annotations: Partial<McpToolAnnotations> | undefined,
): void {
  if (
    typeof annotations?.readOnlyHint !== "boolean" ||
    typeof annotations?.openWorldHint !== "boolean" ||
    typeof annotations?.destructiveHint !== "boolean"
  ) {
    throw new Error(
      `[mcp-chatgpt] Tool "${toolName}" must explicitly set readOnlyHint, openWorldHint, and destructiveHint`,
    );
  }
}

function assertHintTitle(
  toolName: string,
  annotations: Partial<McpToolAnnotations> | undefined,
): void {
  if (!annotations?.title) {
    throw new Error(
      `[mcp-chatgpt] Tool "${toolName}" must have a non-empty annotation title`,
    );
  }
}

/**
 * Assert that all required hint booleans and title are explicitly set.
 * Throws at startup — not silently at runtime — to surface misconfigurations early.
 */
export function assertExplicitToolHints(
  toolName: string,
  annotations: Partial<McpToolAnnotations> | undefined,
): McpToolAnnotations {
  assertHintBooleans(toolName, annotations);
  assertHintTitle(toolName, annotations);
  return annotations as McpToolAnnotations;
}

/**
 * Look up and validate annotations for a known tool name.
 */
export function getMcpToolAnnotations(
  toolName: McpToolName,
): McpToolAnnotations {
  const metadata = MCP_TOOL_METADATA[toolName];
  if (!metadata) {
    throw new Error(
      `[mcp-chatgpt] No metadata registered for tool "${toolName}". Add an entry to MCP_TOOL_METADATA.`,
    );
  }
  return assertExplicitToolHints(toolName, metadata.annotations);
}
