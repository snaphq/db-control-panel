import {
  publicDiscoveryOptions,
  withPublicDiscoveryCors,
} from "@repo/core/agent-auth/cors";
import {
  AGENT_SCOPES_SUPPORTED,
  requestOriginForRequest,
} from "@repo/core/agent-auth/discovery";
import { resolveTenantFromHost } from "@repo/database";

export async function GET(request: Request): Promise<Response> {
  const tenant = await resolveTenantFromHost(request.headers.get("host"));
  if (!tenant)
    return withPublicDiscoveryCors(
      new Response("Unknown tenant host", { status: 404 }),
    );
  const origin = requestOriginForRequest(request);
  return withPublicDiscoveryCors(
    Response.json(
      {
        resource: new URL("/mcp", origin).toString(),
        authorization_servers: [origin],
        resource_signing_alg_values_supported: ["ES256"],
        scopes_supported: AGENT_SCOPES_SUPPORTED,
        bearer_methods_supported: ["header"],
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
