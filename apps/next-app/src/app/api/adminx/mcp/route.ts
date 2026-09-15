import { requestOriginForRequest } from "@/lib/agent-auth/discovery";
import { MCP_ADMIN_SERVER_INFO } from "@/lib/mcp-server-info";
import { auth } from "@repo/auth/server";
import { db, resolveTenantFromHost } from "@repo/database";
import { user } from "@repo/database/schema";
import {
  getCurrentMcpContext,
  logMcpRequest,
  logMcpResponse,
  runWithMcpContext,
} from "@repo/mcp-chatgpt";
import type { McpRequestContext } from "@repo/mcp-chatgpt";
import { registerAdminTools } from "@repo/mcp-server/admin";
import { and, eq, isNull } from "drizzle-orm";
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

async function authorizeAdmin(req: Request): Promise<AdminAuthResult> {
  let tenant: Awaited<ReturnType<typeof resolveTenantFromHost>>;
  try {
    tenant = await resolveTenantFromHost(req.headers.get("host"));
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
      logMessage: "Tenant resolution failed",
    };
  }
  if (!tenant) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "unauthorized", message: "Unknown tenant host" },
        { status: 401 },
      ),
      logMessage: "Unknown tenant host",
    };
  }

  const tenantContext: AdminAuthContext = {
    tenantId: tenant.id,
    resource: new URL(
      "/api/adminx/mcp",
      requestOriginForRequest(req),
    ).toString(),
  };

  try {
    const session = await auth.api.getSession({
      headers: new Headers(req.headers),
    });
    if (!session?.user?.id) {
      return {
        ok: false,
        error: NextResponse.json(
          { error: "unauthorized", message: "Authentication required" },
          { status: 401 },
        ),
        context: tenantContext,
        logMessage: "Authentication required",
      };
    }

    // Do not rely on a role-only lookup here. The MCP boundary must prove that
    // the session subject is an active user of this exact tenant; otherwise a
    // session copied from another host could become a confused-deputy admin
    // credential.
    const [adminUser] = await db()
      .select({ id: user.id, role: user.role })
      .from(user)
      .where(
        and(
          eq(user.id, session.user.id),
          eq(user.tenantId, tenant.id),
          isNull(user.archivedAt),
        ),
      )
      .limit(1);
    if (!adminUser || adminUser.role !== "site-admin") {
      return {
        ok: false,
        error: NextResponse.json(
          { error: "forbidden", message: "Admin access required" },
          { status: 403 },
        ),
        context: {
          ...tenantContext,
          userId: session.user.id,
          actorId: session.user.id,
          actorType: "human",
          authMethod: "session",
        },
        logMessage: "Admin access required",
      };
    }

    return {
      ok: true,
      context: {
        actorId: session.user.id,
        actorType: "human",
        authMethod: "session",
        userId: session.user.id,
        tenantId: tenant.id,
        isAdmin: true,
        resource: tenantContext.resource,
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
      context: tenantContext,
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
      "Use tenant-scoped administrative tools with an active site-admin session.",
  },
  // The route lives at /api/adminx/mcp. mcp-handler derives the transport
  // endpoint by appending /mcp to basePath, so /api would incorrectly expose
  // this handler as /api/mcp.
  { basePath: "/api/adminx", disableSse: true },
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
      logMcpRequest(requestId, method, "/api/adminx/mcp", collectHeaders(req));
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
