import {
  publicDiscoveryOptions,
  withPublicDiscoveryCors,
} from "@repo/core/agent-auth/cors";
import {
  AGENT_SCOPES_SUPPORTED,
  GRANT_CLAIM,
  GRANT_JWT_BEARER,
  buildAgentAuthBlock,
  requestOriginForRequest,
} from "@repo/core/agent-auth/discovery";
import { resolveTenantFromHost } from "@repo/database";

export async function GET(request: Request): Promise<Response> {
  const tenant = await resolveTenantFromHost(request.headers.get("host"));
  if (!tenant)
    return withPublicDiscoveryCors(
      new Response("Unknown tenant host", { status: 404 }),
    );
  const issuer = requestOriginForRequest(request);
  const body = {
    issuer,
    authorization_endpoint: `${issuer}/api/auth/oauth2/authorize`,
    token_endpoint: `${issuer}/api/auth/oauth2/token`,
    userinfo_endpoint: `${issuer}/api/auth/oauth2/userinfo`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    registration_endpoint: `${issuer}/api/auth/oauth2/register`,
    end_session_endpoint: `${issuer}/api/auth/oauth2/endsession`,
    revocation_endpoint: `${issuer}/oauth2/revoke`,
    response_types_supported: ["code"],
    // The standard OIDC endpoint supports authorization code + refresh. The
    // same authorization server also exposes the two auth.md agent grants at
    // /oauth2/token; advertise those supported grants while omitting
    // client_credentials, which is not implemented.
    grant_types_supported: [
      "authorization_code",
      "refresh_token",
      GRANT_JWT_BEARER,
      GRANT_CLAIM,
    ],
    token_endpoint_auth_methods_supported: [
      "client_secret_basic",
      "client_secret_post",
    ],
    scopes_supported: AGENT_SCOPES_SUPPORTED,
    code_challenge_methods_supported: ["S256"],
    resource: new URL("/mcp", issuer).toString(),
    agent_auth: buildAgentAuthBlock(issuer),
  };

  return withPublicDiscoveryCors(
    Response.json(body, {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=3600",
      },
    }),
  );
}

export function OPTIONS(): Response {
  return publicDiscoveryOptions();
}
