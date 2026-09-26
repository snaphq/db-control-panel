import {
  publicDiscoveryOptions,
  withPublicDiscoveryCors,
} from "@repo/core/agent-auth/cors";
import {
  AGENT_SCOPES_SUPPORTED,
  requestOriginForRequest,
} from "@repo/core/agent-auth/discovery";
import { MCP_SERVER_INFO } from "@repo/core/mcp-server-info";
import { resolveTenantFromHost } from "@repo/database";

export async function GET(request: Request): Promise<Response> {
  const tenant = await resolveTenantFromHost(request.headers.get("host"));
  if (!tenant)
    return withPublicDiscoveryCors(
      new Response("Unknown tenant host", { status: 404 }),
    );
  const origin = requestOriginForRequest(request);
  const resource = new URL("/mcp", origin).toString();
  return withPublicDiscoveryCors(
    Response.json(
      {
        serverInfo: MCP_SERVER_INFO,
        resource,
        transport: {
          type: "http",
          endpoint: resource,
        },
        authentication: {
          type: "bearer",
          required: true,
        },
        authorization_servers: [origin],
        scopes_supported: AGENT_SCOPES_SUPPORTED,
        capabilities: {
          tools: true,
          resources: true,
          prompts: false,
        },
      },
      {
        headers: {
          "Cache-Control": "public, max-age=0, s-maxage=3600",
        },
      },
    ),
  );
}

export function OPTIONS(): Response {
  return publicDiscoveryOptions();
}
