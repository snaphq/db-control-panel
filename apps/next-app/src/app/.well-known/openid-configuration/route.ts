import {
  publicDiscoveryOptions,
  withPublicDiscoveryCors,
} from "@repo/core/agent-auth/cors";
import {
  AGENT_SCOPES_SUPPORTED,
  requestOriginForRequest,
} from "@repo/core/agent-auth/discovery";
import { resolveTenantFromHost } from "@repo/database";

/**
 * Application-owned OIDC discovery. Better Auth's default metadata advertises
 * its internal JWKS route and unsupported algorithms/grants, so this document
 * is constructed from the routes and policies that are actually exposed.
 */
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
    scopes_supported: AGENT_SCOPES_SUPPORTED,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["ES256"],
    token_endpoint_auth_methods_supported: [
      "client_secret_basic",
      "client_secret_post",
    ],
    code_challenge_methods_supported: ["S256"],
    claims_supported: [
      "sub",
      "iss",
      "aud",
      "exp",
      "nbf",
      "iat",
      "jti",
      "email",
      "email_verified",
      "name",
      "picture",
      "given_name",
      "family_name",
    ],
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
