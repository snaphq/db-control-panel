import {
  bearerChallenge,
  requestOriginForRequest,
  resourceUrlForRequest,
} from "@/lib/agent-auth/discovery";
import { AgentAuthConfigurationError } from "@/lib/agent-auth/keys";
import { verifyAgentAccessToken } from "@/lib/agent-auth/tokens";
import { verifyOAuthMcpToken } from "@/lib/auth/oauth-token";
import { verifyOperatorToken } from "@/lib/auth/operator-token";
import { MCP_SERVER_INFO } from "@/lib/mcp-server-info";
import "@/lib/operators/activity";
import { getSiteUrl } from "@/lib/site-config";
import { resolveTenantFromHost } from "@repo/database";
import {
  logMcpRequest,
  logMcpResponse,
  runWithMcpContext,
} from "@repo/mcp-chatgpt";
import type { McpRequestContext } from "@repo/mcp-chatgpt";
import { registerWidgetTools } from "@repo/mcp-server/widget";
import { createMcpHandler } from "mcp-handler";
import { NextResponse } from "next/server";

type McpHandler = ReturnType<typeof createMcpHandler>;
type McpAuthContext = Omit<McpRequestContext, "requestId">;

type AuthResult =
  | {
      ok: true;
      context: McpAuthContext;
    }
  | {
      ok: false;
      error: NextResponse;
      context?: McpAuthContext;
      logMessage: string;
    };

type AuthorizationClassification =
  | { kind: "missing" }
  | { kind: "unsupported" }
  | { kind: "malformed" }
  | { kind: "bearer" };

function classifyAuthorization(req: Request): AuthorizationClassification {
  const value = req.headers.get("authorization")?.trim() ?? "";
  if (!value) return { kind: "missing" };

  const separator = value.search(/\s/);
  if (separator < 0) {
    return value.toLowerCase() === "bearer"
      ? { kind: "malformed" }
      : { kind: "unsupported" };
  }

  const scheme = value.slice(0, separator);
  if (scheme.toLowerCase() !== "bearer") return { kind: "unsupported" };

  const credentials = value.slice(separator).trim();
  // Bearer credentials are one token. Multiple whitespace-separated values or
  // a combined Authorization header are malformed requests, not invalid
  // credentials that should be sent through the token stores.
  if (!credentials || /[\s,]/.test(credentials)) {
    return { kind: "malformed" };
  }
  return { kind: "bearer" };
}

function authorizationFailure(
  req: Request,
  classification: Exclude<AuthorizationClassification, { kind: "bearer" }>,
): {
  error: NextResponse;
  logMessage: string;
} {
  switch (classification.kind) {
    case "missing":
      return {
        error: NextResponse.json(
          { error: "unauthorized", message: "Bearer token required" },
          {
            status: 401,
            headers: { "WWW-Authenticate": bearerChallenge(req) },
          },
        ),
        logMessage: "Bearer token required",
      };
    case "unsupported":
      return {
        error: NextResponse.json(
          {
            error: "unsupported_authorization_scheme",
            message: "Bearer authentication required",
          },
          {
            status: 401,
            headers: { "WWW-Authenticate": bearerChallenge(req) },
          },
        ),
        logMessage: "Unsupported authorization scheme",
      };
    case "malformed":
      return {
        error: NextResponse.json(
          {
            error: "invalid_request",
            message: "Malformed bearer authorization header",
          },
          {
            status: 400,
            headers: {
              "WWW-Authenticate": `${bearerChallenge(req)}, error="invalid_request"`,
            },
          },
        ),
        logMessage: "Malformed bearer authorization header",
      };
  }
}

/**
 * mcp-handler builds a stateless server once per handler. Keep one handler per
 * validated tenant origin so widget HTML, CSP metadata, and resource domains
 * cannot leak the first request's host into another tenant's response.
 */
const handlersByOrigin = new Map<string, McpHandler>();
const MAX_HANDLER_CACHE_SIZE = 32;

function handlerForOrigin(origin: string): McpHandler {
  const existing = handlersByOrigin.get(origin);
  if (existing) {
    // Refresh insertion order so frequently used tenant origins stay warm.
    handlersByOrigin.delete(origin);
    handlersByOrigin.set(origin, existing);
    return existing;
  }

  const handler = createMcpHandler(
    async (server) => {
      // Keep tenant-specific resource/CSP metadata on `origin`, but load the
      // HTML snapshot only from the configured application URL. The request
      // Host is tenant input and may be a local alias that must not become an
      // arbitrary server-side fetch target.
      await registerWidgetTools(server, {
        baseURL: origin,
        contentURL: getSiteUrl(),
      });
    },
    {
      serverInfo: MCP_SERVER_INFO,
      instructions:
        "Use the authenticated starter-kit tools; every request is tenant-bound.",
    },
    // The public surface is Streamable HTTP. Keep the legacy SSE route disabled
    // so discovery, deployment, and runtime transport behavior agree.
    { disableSse: true },
  );
  if (handlersByOrigin.size >= MAX_HANDLER_CACHE_SIZE) {
    const oldest = handlersByOrigin.keys().next().value;
    if (typeof oldest === "string") handlersByOrigin.delete(oldest);
  }
  handlersByOrigin.set(origin, handler);
  return handler;
}

function collectHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

async function withAuth(req: Request): Promise<AuthResult> {
  const production =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production";

  // Resolve the tenant before considering any development override. Even an
  // unauthenticated local server must not turn an arbitrary Host header into
  // a valid tenant context or a widget origin.
  const tenant = await resolveTenantFromHost(req.headers.get("host"));
  if (!tenant) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "not_found", message: "MCP resource not found" },
        { status: 404 },
      ),
      logMessage: "Unknown tenant host",
    };
  }

  const tenantContext: McpAuthContext = {
    tenantId: tenant.id,
    resource: resourceUrlForRequest(req),
  };

  try {
    // An unauthenticated MCP server is useful only for local development.
    // Never honor the override on a production deployment, even if an old
    // environment variable was copied forward.
    if (process.env.MCP_REQUIRE_AUTH === "false" && !production) {
      return {
        ok: true,
        context: {
          // Keep the actor taxonomy closed: the bypass is an execution mode,
          // not a canonical actor. Logging still records the development auth
          // method explicitly.
          actorType: "system",
          authMethod: "development",
          tenantId: tenant.id,
          scopes: ["api.read"],
          resource: resourceUrlForRequest(req),
        },
      };
    }

    const authorization = classifyAuthorization(req);
    if (authorization.kind !== "bearer") {
      const failure = authorizationFailure(req, authorization);
      return {
        ok: false,
        ...failure,
        context: tenantContext,
      };
    }

    // Agent access tokens (auth.md flow) take precedence over opaque account
    // tokens.
    const agentToken = await verifyAgentAccessToken(req);
    if (agentToken) {
      return {
        ok: true,
        context: {
          actorId: agentToken.registrationId,
          actorType: "external_agent",
          authMethod: "agent_jwt",
          credentialId: agentToken.credentialId,
          userId: agentToken.userId ?? undefined,
          tenantId: agentToken.tenantId,
          orgId: agentToken.organizationId ?? undefined,
          scopes: agentToken.scope.split(" ").filter(Boolean),
          resource: resourceUrlForRequest(req),
        },
      };
    }
    // Operator credentials replace the retired personal account tokens.
    const operator = await verifyOperatorToken(req);
    if (operator) {
      return {
        ok: true,
        context: {
          actorId: operator.operatorId,
          actorType: "operator",
          actorName: operator.operatorName,
          authMethod: "operator_credential",
          credentialId: operator.credentialId,
          userId: operator.userId,
          tenantId: operator.tenantId,
          orgId:
            operator.organizations.length === 1
              ? operator.organizations[0].id
              : undefined,
          operator: {
            id: operator.operatorId,
            name: operator.operatorName,
            organizations: operator.organizations,
          },
          scopes: operator.scopes,
          resource: resourceUrlForRequest(req),
        },
      };
    }

    const oauthToken = await verifyOAuthMcpToken(req);
    if (oauthToken) {
      return {
        ok: true,
        context: {
          actorId: oauthToken.userId,
          actorType: "human",
          authMethod: "oauth",
          credentialId: oauthToken.tokenId,
          userId: oauthToken.userId,
          tenantId: oauthToken.tenantId,
          scopes: oauthToken.scope.split(" ").filter(Boolean),
          resource: oauthToken.resource,
        },
      };
    }
  } catch (error) {
    if (error instanceof AgentAuthConfigurationError) {
      return {
        ok: false,
        error: NextResponse.json(
          {
            error: "temporarily_unavailable",
            message: "Agent authentication is not configured",
          },
          { status: 503 },
        ),
        context: tenantContext,
        logMessage: "Authentication unavailable",
      };
    }
    return {
      ok: false,
      error: NextResponse.json(
        {
          error: "internal_server_error",
          message: "MCP authentication failed",
        },
        { status: 500 },
      ),
      context: tenantContext,
      logMessage: "Authentication failed",
    };
  }

  return {
    ok: false,
    error: NextResponse.json(
      { error: "invalid_token", message: "Invalid bearer token" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `${bearerChallenge(req)}, error="invalid_token"`,
        },
      },
    ),
    context: tenantContext,
    logMessage: "Invalid bearer token",
  };
}

function insufficientScopeResponse(req: Request): NextResponse {
  return NextResponse.json(
    {
      error: "insufficient_scope",
      message: "The MCP resource requires the api.read scope.",
    },
    {
      status: 403,
      headers: {
        "WWW-Authenticate": `${bearerChallenge(req)}, error="insufficient_scope", scope="api.read"`,
      },
    },
  );
}

async function handleMcp(req: Request, method: string): Promise<Response> {
  const requestId = crypto.randomUUID();
  const start = Date.now();

  let authResult: AuthResult;
  try {
    authResult = await withAuth(req);
  } catch (error) {
    // Authentication infrastructure failures are still recorded exactly once
    // and never escape as an unstructured framework error. Tenant context may
    // be unavailable when tenant resolution itself failed, so keep this
    // fallback deliberately limited to the request ID.
    return runWithMcpContext({ requestId }, async () => {
      logMcpRequest(requestId, method, "/mcp", collectHeaders(req));
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
    });
  }

  const ctx = {
    requestId,
    ...(authResult.ok ? authResult.context : (authResult.context ?? {})),
  };
  return runWithMcpContext(ctx, async () => {
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

    if (!authResult.context.scopes?.includes("api.read")) {
      logMcpResponse(requestId, 403, Date.now() - start, "Insufficient scope");
      return insufficientScopeResponse(req);
    }

    try {
      const response = await handlerForOrigin(requestOriginForRequest(req))(
        req,
      );
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
  });
}

export async function GET(req: Request) {
  return handleMcp(req, "GET");
}

export async function POST(req: Request) {
  return handleMcp(req, "POST");
}
