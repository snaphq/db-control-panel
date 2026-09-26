import { getAdminSession } from "@/lib/admin-auth";
import { requestOriginForRequest } from "@repo/core/agent-auth/discovery";
import { MCP_ADMIN_SERVER_INFO } from "@repo/core/mcp-server-info";
import { db, eq, or } from "@repo/database";
import { tenant } from "@repo/database/schema";
import {
  getCurrentMcpContext,
  logMcpRequest,
  logMcpResponse,
  runWithMcpContext,
} from "@repo/mcp-chatgpt";
import type { McpRequestContext } from "@repo/mcp-chatgpt";
import { registerAdminTools } from "@repo/mcp-server/admin";
import { createMcpHandler } from "mcp-handler";
import { NextResponse } from "next/server";

type AdminAuthContext = Omit<McpRequestContext, "requestId">;
type AdminAuthResult =
  | { ok: true; context: AdminAuthContext }
  | {
      ok: false;
      error: NextResponse;
      context?: AdminAuthContext;
      logMessage: string;
    };

function collectHeaders(req: Request): Record<string, string> {
  const result: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/**
 * The backend MCP endpoint serves platform admins signed in to this app.
 * Admin tools are tenant-scoped, so the caller names the tenant explicitly
 * with `?tenant=<tenant id or slug>`; there is no implicit default.
 */
async function authorizeAdmin(req: Request): Promise<AdminAuthResult> {
  const url = new URL(req.url);
  const resource = new URL("/mcp", requestOriginForRequest(req)).toString();
  const tenantKey = url.searchParams.get("tenant")?.trim();
  if (!tenantKey) {
    return {
      ok: false,
      error: NextResponse.json(
        {
          error: "invalid_request",
          message: "Pass the tenant to administer as ?tenant=<id or slug>",
        },
        { status: 400 },
      ),
      logMessage: "Missing tenant parameter",
    };
  }

  try {
    const session = await getAdminSession();
    if (!session) {
      return {
        ok: false,
        error: NextResponse.json(
          { error: "unauthorized", message: "Admin sign-in required" },
          { status: 401 },
        ),
        logMessage: "Authentication required",
      };
    }

    const [row] = await db()
      .select({ id: tenant.id })
      .from(tenant)
      .where(or(eq(tenant.id, tenantKey), eq(tenant.slug, tenantKey)))
      .limit(1);
    if (!row) {
      return {
        ok: false,
        error: NextResponse.json(
          { error: "not_found", message: "Unknown tenant" },
          { status: 404 },
        ),
        logMessage: "Unknown tenant",
      };
    }

    return {
      ok: true,
      context: {
        actorId: session.user.id,
        actorType: "human",
        authMethod: "session",
        tenantId: row.id,
        isAdmin: true,
        resource,
      },
    };
  } catch {
    return {
      ok: false,
      error: NextResponse.json(
        {
          error: "internal_server_error",
          message: "MCP authorization is unavailable",
        },
        { status: 500 },
      ),
      logMessage: "Authorization failed",
    };
  }
}

async function requireAdmin(): Promise<void> {
  if (!getCurrentMcpContext()?.isAdmin) {
    throw new Error("Forbidden: Admin access required");
  }
}

const handler = createMcpHandler(
  (server) => {
    registerAdminTools(server, requireAdmin);
  },
  {
    serverInfo: MCP_ADMIN_SERVER_INFO,
    instructions:
      "Use tenant-scoped administrative tools with an active backend admin session.",
  },
  // The route lives at /mcp, which is mcp-handler's default endpoint.
  { disableSse: true },
);

async function handleMcp(req: Request, method: string): Promise<Response> {
  const requestId = crypto.randomUUID();
  const start = Date.now();

  let authResult: AdminAuthResult;
  try {
    authResult = await authorizeAdmin(req);
  } catch {
    authResult = {
      ok: false,
      error: NextResponse.json(
        {
          error: "internal_server_error",
          message: "MCP authorization is unavailable",
        },
        { status: 500 },
      ),
      logMessage: "Authorization failed",
    };
  }

  return runWithMcpContext(
    {
      requestId,
      ...(authResult.ok ? authResult.context : (authResult.context ?? {})),
    },
    async () => {
      logMcpRequest(requestId, method, "/mcp", collectHeaders(req));
      if (!authResult.ok) {
        logMcpResponse(
          requestId,
          authResult.error.status,
          Date.now() - start,
          authResult.logMessage,
        );
        return authResult.error;
      }

      try {
        const response = await handler(req);
        logMcpResponse(requestId, response.status, Date.now() - start);
        return response;
      } catch (error) {
        logMcpResponse(
          requestId,
          500,
          Date.now() - start,
          error instanceof Error ? error : new Error(String(error)),
        );
        return NextResponse.json(
          { error: "internal_server_error", message: "MCP request failed" },
          { status: 500 },
        );
      }
    },
  );
}

export function GET(req: Request) {
  return handleMcp(req, "GET");
}

export function POST(req: Request) {
  return handleMcp(req, "POST");
}
