import {
  and,
  db,
  eq,
  getSafeSessions,
  getTenantAdminStats,
  searchOrganizations,
  searchProjects,
  searchUsers,
} from "@repo/database";
import { organization, user } from "@repo/database/schema";
import {
  getCurrentMcpContext,
  registerMcpTool,
  wrapToolHandler,
} from "@repo/mcp-chatgpt";
import { parseSearchQuery } from "@repo/search";
import { z } from "zod";
import type { McpServer, RequireAdmin } from "./types";

// ─── Response helpers ──────────────────────────────────────────────────────

function mcpText(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function mcpError(err: unknown) {
  const rawMessage = err instanceof Error ? err.message : "";
  const message = rawMessage.startsWith("Unauthorized")
    ? "Authentication required"
    : rawMessage.startsWith("Forbidden")
      ? "Admin access required"
      : "The admin operation failed";

  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: `Error: ${message}`,
      },
    ],
  };
}

function currentTenantId(): string {
  const tenantId = getCurrentMcpContext()?.tenantId;
  if (!tenantId) throw new Error("Forbidden: tenant context required");
  return tenantId;
}

// ─── Tool registration ─────────────────────────────────────────────────────

/**
 * Register all admin MCP tools on the given server instance.
 *
 * Each tool calls `requireAdmin` before executing to verify the caller
 * has admin privileges. The auth check is injected because it depends on
 * the Next.js request context (`headers()`), which is unavailable here.
 *
 * Tool annotations are injected automatically from the central
 * MCP_TOOL_METADATA registry in @repo/mcp-chatgpt.
 */
export function registerAdminTools(
  server: McpServer,
  requireAdmin: RequireAdmin,
): void {
  registerMcpTool(
    server,
    "get_admin_stats",
    {
      description:
        "Get tenant-scoped statistics about users, organizations, and active sessions",
      inputSchema: {},
    },
    wrapToolHandler("get_admin_stats", async () => {
      try {
        await requireAdmin();
        return mcpText(await getTenantAdminStats(currentTenantId()));
      } catch (err) {
        return mcpError(err);
      }
    }),
  );

  registerMcpTool(
    server,
    "get_user_by_email",
    {
      description: "Get user information by email address",
      inputSchema: { email: z.string().email() },
    },
    wrapToolHandler(
      "get_user_by_email",
      async ({ email }: { email: string }) => {
        try {
          await requireAdmin();
          const tenantId = currentTenantId();
          const [found] = await db()
            .select({
              id: user.id,
              tenantId: user.tenantId,
              name: user.name,
              publicEmail: user.publicEmail,
              emailVerified: user.emailVerified,
              role: user.role,
              archivedAt: user.archivedAt,
              createdAt: user.createdAt,
            })
            .from(user)
            .where(
              and(eq(user.publicEmail, email), eq(user.tenantId, tenantId)),
            )
            .limit(1);
          return found
            ? mcpText(found)
            : mcpText(`User with email ${email} not found`);
        } catch (err) {
          return mcpError(err);
        }
      },
    ),
  );

  registerMcpTool(
    server,
    "search_records",
    {
      description:
        "Search tenant-scoped organizations, projects, or users with expressive query syntax",
      inputSchema: {
        query: z.string().max(256).optional(),
        entity: z.enum(["organization", "project", "user"]).optional(),
        organizationId: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).max(100000).optional(),
      },
    },
    wrapToolHandler(
      "search_records",
      async ({
        query = "",
        entity = "organization",
        organizationId,
        limit = 50,
        offset = 0,
      }: {
        query?: string;
        entity?: "organization" | "project" | "user";
        organizationId?: string;
        limit?: number;
        offset?: number;
      }) => {
        try {
          await requireAdmin();
          const parsed = parseSearchQuery(query);
          const options = { query: parsed, limit, offset };
          const tenantId = currentTenantId();
          const result =
            entity === "project"
              ? await searchProjects(tenantId, organizationId ?? null, options)
              : entity === "user"
                ? await searchUsers(tenantId, options)
                : await searchOrganizations(tenantId, options);
          return mcpText(result);
        } catch (err) {
          return mcpError(err);
        }
      },
    ),
  );

  registerMcpTool(
    server,
    "get_user_by_id",
    {
      description: "Get user information by user ID",
      inputSchema: { userId: z.string() },
    },
    wrapToolHandler(
      "get_user_by_id",
      async ({ userId }: { userId: string }) => {
        try {
          await requireAdmin();
          const tenantId = currentTenantId();
          const [found] = await db()
            .select({
              id: user.id,
              tenantId: user.tenantId,
              name: user.name,
              publicEmail: user.publicEmail,
              emailVerified: user.emailVerified,
              role: user.role,
              archivedAt: user.archivedAt,
              createdAt: user.createdAt,
            })
            .from(user)
            .where(and(eq(user.id, userId), eq(user.tenantId, tenantId)))
            .limit(1);
          return found
            ? mcpText(found)
            : mcpText(`User with ID ${userId} not found`);
        } catch (err) {
          return mcpError(err);
        }
      },
    ),
  );

  registerMcpTool(
    server,
    "list_users",
    {
      description: "List all users with optional limit",
      inputSchema: { limit: z.number().int().min(1).max(100).optional() },
    },
    wrapToolHandler(
      "list_users",
      async ({ limit = 50 }: { limit?: number }) => {
        try {
          await requireAdmin();
          const tenantId = currentTenantId();
          const rows = await db()
            .select({
              id: user.id,
              tenantId: user.tenantId,
              name: user.name,
              publicEmail: user.publicEmail,
              emailVerified: user.emailVerified,
              role: user.role,
              archivedAt: user.archivedAt,
              createdAt: user.createdAt,
            })
            .from(user)
            .where(eq(user.tenantId, tenantId))
            .orderBy(user.createdAt)
            .limit(limit);
          return mcpText(rows);
        } catch (err) {
          return mcpError(err);
        }
      },
    ),
  );

  registerMcpTool(
    server,
    "list_organizations",
    {
      description: "List all organizations with optional limit",
      inputSchema: { limit: z.number().int().min(1).max(100).optional() },
    },
    wrapToolHandler(
      "list_organizations",
      async ({ limit = 50 }: { limit?: number }) => {
        try {
          await requireAdmin();
          const tenantId = currentTenantId();
          const rows = await db()
            .select()
            .from(organization)
            .where(eq(organization.tenantId, tenantId))
            .orderBy(organization.createdAt)
            .limit(limit);
          return mcpText(rows);
        } catch (err) {
          return mcpError(err);
        }
      },
    ),
  );

  registerMcpTool(
    server,
    "get_active_sessions",
    {
      description: "Get all active user sessions",
      inputSchema: { limit: z.number().int().min(1).max(100).optional() },
    },
    wrapToolHandler(
      "get_active_sessions",
      async ({ limit = 50 }: { limit?: number }) => {
        try {
          await requireAdmin();
          const rows = await getSafeSessions({
            activeOnly: true,
            limit,
            tenantId: currentTenantId(),
          });
          return mcpText(rows);
        } catch (err) {
          return mcpError(err);
        }
      },
    ),
  );

  registerMcpTool(
    server,
    "get_organization_by_id",
    {
      description: "Get organization information by organization ID",
      inputSchema: { organizationId: z.string() },
    },
    wrapToolHandler(
      "get_organization_by_id",
      async ({ organizationId }: { organizationId: string }) => {
        try {
          await requireAdmin();
          const tenantId = currentTenantId();
          const [found] = await db()
            .select()
            .from(organization)
            .where(
              and(
                eq(organization.id, organizationId),
                eq(organization.tenantId, tenantId),
              ),
            )
            .limit(1);
          return found
            ? mcpText(found)
            : mcpText(`Organization with ID ${organizationId} not found`);
        } catch (err) {
          return mcpError(err);
        }
      },
    ),
  );
}
