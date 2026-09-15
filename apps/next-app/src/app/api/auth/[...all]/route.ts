import { resourceUrlForRequest } from "@/lib/agent-auth/discovery";
import { bindMcpOAuthResponse } from "@/lib/auth/oauth-route-binding";
import {
  handleTenantBoundClient,
  handleTenantBoundEndSession,
  handleTenantBoundUserInfo,
} from "@/lib/auth/oauth-route-interactive";
import {
  normalizeBasicAuthorizationRequest,
  oauthError,
  parseOAuthForm,
} from "@/lib/auth/oauth-route-utils";
import { validateMcpOAuthRequest } from "@/lib/auth/oauth-route-validation";
import { baseServer, runWithAuthTenantContext } from "@repo/auth/server";
import { resolveTenantFromHost } from "@repo/database";

export const runtime = "nodejs";

async function handleAuthRequest(
  request: Request,
  method: "GET" | "POST",
): Promise<Response> {
  const tenant = await resolveTenantFromHost(request.headers.get("host"));
  if (!tenant) return new Response("Unknown tenant host", { status: 404 });
  return runWithAuthTenantContext(
    {
      tenantId: tenant.id,
      resource: resourceUrlForRequest(request),
    },
    () => handleAuthRequestForTenant(request, method, tenant.id),
  );
}

async function handleAuthRequestForTenant(
  request: Request,
  method: "GET" | "POST",
  tenantId: string,
): Promise<Response> {
  const validation = await validateMcpOAuthRequest(request);
  if (validation) return validation;
  const authPath = new URL(request.url).pathname;
  if (authPath.endsWith("/oauth2/userinfo")) {
    return handleTenantBoundUserInfo(request, tenantId);
  }
  if (authPath.includes("/oauth2/client/")) {
    return handleTenantBoundClient(request, tenantId);
  }
  if (authPath.endsWith("/oauth2/endsession")) {
    return handleTenantBoundEndSession(request, tenantId);
  }
  // Better Auth consumes POST bodies while dispatching an endpoint. Capture
  // the token form before handing it the original request so refresh-token
  // rotation and resource binding can inspect the same grant afterward.
  let tokenForm: URLSearchParams | undefined;
  if (method === "POST" && authPath.endsWith("/oauth2/token")) {
    try {
      tokenForm = await parseOAuthForm(request);
    } catch {
      return oauthError("invalid_request", "Body must be form-encoded");
    }
  }
  const handler = await baseServer.getApiHandler();
  // Better Auth's OIDC adapter recognizes only the canonical `Basic ` casing
  // even though RFC 7235 defines auth-schemes case-insensitively. Normalize a
  // valid lower/mixed-case scheme on the request passed upstream while keeping
  // the original request for tenant/resource binding and audit context.
  const authRequest =
    method === "POST" && authPath.endsWith("/oauth2/token")
      ? normalizeBasicAuthorizationRequest(request)
      : request;
  const response = await handler[method](authRequest);
  return bindMcpOAuthResponse(request, response, tokenForm);
}

export async function GET(request: Request) {
  return handleAuthRequest(request, "GET");
}

export async function POST(request: Request) {
  return handleAuthRequest(request, "POST");
}
