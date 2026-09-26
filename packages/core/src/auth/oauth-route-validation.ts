import { createHash, randomUUID } from "node:crypto";
import { auth } from "@repo/auth/server";
import { db, resolveTenantFromHost } from "@repo/database";
import {
  oauthAccessToken,
  oauthApplication,
  user,
  verification,
} from "@repo/database/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { resourceUrlForRequest } from "../agent-auth/discovery";
import {
  matchesS256CodeChallenge,
  parseBasicAuthorization,
  validateDynamicRegistration,
} from "../agent-auth/oauth-policy";
import {
  oauthError,
  parseJsonObject,
  parseOAuthForm,
  parseVerificationValue,
  validateTenantSession,
} from "./oauth-route-utils";

export async function clientBelongsToTenant(
  clientId: string | null,
  tenantId: string,
): Promise<boolean> {
  if (!clientId) return false;
  const [client] = await db()
    .select({ id: oauthApplication.id, disabled: oauthApplication.disabled })
    .from(oauthApplication)
    .where(
      and(
        eq(oauthApplication.clientId, clientId),
        eq(oauthApplication.tenantId, tenantId),
      ),
    )
    .limit(1);
  return Boolean(client && client.disabled !== true);
}

async function validateAuthorizationCodeBinding(
  form: URLSearchParams,
  tenantId: string,
  resource: string,
  clientId: string,
): Promise<Response | null> {
  const code = form.get("code")?.trim();
  if (!code) {
    return oauthError("invalid_request", "code is required");
  }
  const [row] = await db()
    .select({
      id: verification.id,
      value: verification.value,
      expiresAt: verification.expiresAt,
      tenantId: verification.tenantId,
    })
    .from(verification)
    .where(
      and(
        eq(verification.identifier, code),
        eq(verification.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (
    !row ||
    row.tenantId !== tenantId ||
    row.expiresAt.getTime() <= Date.now()
  ) {
    return oauthError(
      "invalid_grant",
      "Authorization code is invalid or expired",
    );
  }
  const value = parseVerificationValue(row.value);
  if (typeof value?.mcpExchangeClaim === "string") {
    return oauthError(
      "invalid_grant",
      "Authorization code has already been redeemed",
    );
  }
  if (
    !value ||
    value.clientId !== clientId ||
    value.resource !== resource ||
    typeof value.userId !== "string"
  ) {
    return oauthError(
      "invalid_grant",
      "Authorization code is not bound to this client or resource",
    );
  }
  const redirectUri = form.get("redirect_uri")?.trim();
  if (!redirectUri || value.redirectURI !== redirectUri) {
    return oauthError(
      "invalid_grant",
      "redirect_uri does not match the authorization code",
    );
  }
  if (
    value.codeChallengeMethod !== "S256" &&
    value.codeChallengeMethod !== "s256"
  ) {
    return oauthError(
      "invalid_request",
      "Authorization code must use S256 PKCE",
    );
  }
  if (
    typeof value.codeChallenge !== "string" ||
    value.codeChallenge.length === 0
  ) {
    return oauthError(
      "invalid_request",
      "Authorization code must include an S256 code challenge",
    );
  }
  const codeVerifier = form.get("code_verifier")?.trim();
  if (
    !codeVerifier ||
    !matchesS256CodeChallenge(codeVerifier, value.codeChallenge)
  ) {
    return oauthError(
      "invalid_grant",
      "code_verifier does not match the authorization code",
    );
  }
  const [codeUser] = await db()
    .select({ tenantId: user.tenantId, archivedAt: user.archivedAt })
    .from(user)
    .where(eq(user.id, value.userId))
    .limit(1);
  if (
    !codeUser ||
    codeUser.archivedAt !== null ||
    codeUser.tenantId !== tenantId
  ) {
    return oauthError(
      "invalid_grant",
      "Authorization code user is no longer active",
    );
  }

  // Better Auth deletes the verification row as part of the exchange, but a
  // read-then-delete sequence can still race: two requests may both read the
  // same code before either delete commits. Mark it with an optimistic CAS so
  // only one request can hand the code to Better Auth. The marker is an
  // internal JSON field and is ignored by the upstream OIDC implementation.
  const [claimed] = await db()
    .update(verification)
    .set({
      value: JSON.stringify({ ...value, mcpExchangeClaim: randomUUID() }),
    })
    .where(
      and(
        eq(verification.id, row.id),
        eq(verification.tenantId, tenantId),
        eq(verification.value, row.value),
        gt(verification.expiresAt, new Date()),
      ),
    )
    .returning({ id: verification.id });
  if (!claimed) {
    return oauthError(
      "invalid_grant",
      "Authorization code has already been redeemed",
    );
  }
  return null;
}

async function validateConsentBinding(
  request: Request,
  tenantId: string,
  resource: string,
): Promise<Response | null> {
  const sessionError = await validateTenantSession(request, true);
  if (sessionError) return sessionError;
  let body: Record<string, unknown> | null = null;
  try {
    body = parseJsonObject(await request.clone().text());
  } catch {
    return oauthError("invalid_request", "Consent body must be JSON");
  }
  const consentCode =
    typeof body?.consent_code === "string" ? body.consent_code : null;
  if (!consentCode) return null;
  const [row] = await db()
    .select({
      value: verification.value,
      expiresAt: verification.expiresAt,
      tenantId: verification.tenantId,
    })
    .from(verification)
    .where(
      and(
        eq(verification.identifier, consentCode),
        eq(verification.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (
    !row ||
    row.tenantId !== tenantId ||
    row.expiresAt.getTime() <= Date.now()
  ) {
    return oauthError(
      "invalid_request",
      "Consent request is invalid or expired",
    );
  }
  const value = parseVerificationValue(row.value);
  const clientId = typeof value?.clientId === "string" ? value.clientId : null;
  if (!clientId || value?.resource !== resource) {
    return oauthError(
      "invalid_target",
      "Consent is not bound to this MCP resource",
    );
  }
  if (!(await clientBelongsToTenant(clientId, tenantId))) {
    return oauthError(
      "invalid_client",
      "Client is not registered for this tenant",
    );
  }
  const session = await auth.api.getSession({
    headers: new Headers(request.headers),
  });
  if (!session?.user?.id || value?.userId !== session.user.id) {
    return oauthError(
      "invalid_request",
      "Consent must be completed by the signed-in user",
    );
  }
  return null;
}

function clientIdFromRequest(
  form: URLSearchParams,
  request: Request,
): string | null {
  const formClientId = form.get("client_id")?.trim();
  if (formClientId) return formClientId;
  return (
    parseBasicAuthorization(request.headers.get("authorization"))?.clientId ??
    null
  );
}

function clientSecretFromRequest(
  form: URLSearchParams,
  request: Request,
): string | null {
  const basic = parseBasicAuthorization(request.headers.get("authorization"));
  if (basic) return basic.clientSecret;
  return form.get("client_secret")?.trim() || null;
}

function hashClientSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("base64url");
}

async function validateClientAuthentication(
  form: URLSearchParams,
  request: Request,
  tenantId: string,
): Promise<Response | null> {
  const clientId = clientIdFromRequest(form, request);
  if (!clientId) return oauthError("invalid_client", "client_id is required");

  const basic = request.headers.get("authorization") ?? "";
  const basicCredentials = parseBasicAuthorization(basic);
  if (/^Basic\s/i.test(basic.trim()) && !basicCredentials) {
    return oauthError(
      "invalid_client",
      "Malformed Basic client authentication",
    );
  }
  const formClientId = form.get("client_id")?.trim() || null;
  if (
    basicCredentials &&
    formClientId &&
    basicCredentials.clientId !== formClientId
  ) {
    return oauthError(
      "invalid_client",
      "client_id does not match the Basic authentication identity",
    );
  }
  if (basicCredentials && form.has("client_secret")) {
    return oauthError(
      "invalid_client",
      "Do not send client_secret in both Basic authentication and the request body",
    );
  }

  const [client] = await db()
    .select({
      clientSecret: oauthApplication.clientSecret,
      type: oauthApplication.type,
      disabled: oauthApplication.disabled,
    })
    .from(oauthApplication)
    .where(
      and(
        eq(oauthApplication.clientId, clientId),
        eq(oauthApplication.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (!client || client.disabled === true) {
    return oauthError(
      "invalid_client",
      "Client is not registered for this tenant",
    );
  }

  // Dynamic registration is confidential-only. Keep support for an existing
  // public client only when it is explicitly marked public and PKCE is used.
  if (client.type === "public") return null;
  const presented = clientSecretFromRequest(form, request);
  if (!presented || !client.clientSecret) {
    return oauthError("invalid_client", "client_secret is required");
  }
  if (hashClientSecret(presented) !== client.clientSecret) {
    return oauthError("invalid_client", "client authentication failed");
  }
  return null;
}

/** Validate a refresh token without consuming it before the upstream exchange. */
async function validateRefreshToken(
  form: URLSearchParams,
  tenantId: string,
  resource: string,
  clientId: string | null,
): Promise<Response | null> {
  const refreshToken = form.get("refresh_token")?.trim();
  if (!refreshToken) {
    return oauthError("invalid_request", "refresh_token is required");
  }
  if (!clientId) {
    return oauthError("invalid_client", "client_id is required");
  }

  const [row] = await db()
    .select({
      id: oauthAccessToken.id,
      tokenClientId: oauthAccessToken.clientId,
      tokenResource: oauthAccessToken.resource,
      refreshTokenExpiresAt: oauthAccessToken.refreshTokenExpiresAt,
      userId: oauthAccessToken.userId,
      clientRecordId: oauthApplication.id,
      clientDisabled: oauthApplication.disabled,
    })
    .from(oauthAccessToken)
    .leftJoin(
      oauthApplication,
      and(
        eq(oauthApplication.clientId, oauthAccessToken.clientId),
        eq(oauthApplication.tenantId, oauthAccessToken.tenantId),
      ),
    )
    .where(
      and(
        eq(oauthAccessToken.refreshToken, refreshToken),
        eq(oauthAccessToken.tenantId, tenantId),
        isNull(oauthAccessToken.revokedAt),
      ),
    )
    .limit(1);

  if (
    !row ||
    !row.clientRecordId ||
    row.clientDisabled === true ||
    row.tokenClientId !== clientId
  ) {
    return oauthError("invalid_grant", "refresh token is invalid");
  }
  if (!row.tokenResource || row.tokenResource !== resource) {
    return oauthError(
      "invalid_target",
      "refresh token is bound to a different MCP resource",
    );
  }
  if (
    !row.refreshTokenExpiresAt ||
    row.refreshTokenExpiresAt.getTime() <= Date.now()
  ) {
    return oauthError("invalid_grant", "refresh token has expired");
  }

  if (row.userId) {
    const [tokenUser] = await db()
      .select({ tenantId: user.tenantId, archivedAt: user.archivedAt })
      .from(user)
      .where(eq(user.id, row.userId))
      .limit(1);
    if (
      !tokenUser ||
      tokenUser.archivedAt !== null ||
      tokenUser.tenantId !== tenantId
    ) {
      return oauthError("invalid_grant", "user is no longer active");
    }
  }

  return null;
}

/** Enforce the single MCP resource and S256 PKCE before Better Auth sees it. */
export async function validateMcpOAuthRequest(
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (
    !url.pathname.endsWith("/oauth2/authorize") &&
    !url.pathname.endsWith("/oauth2/token") &&
    !url.pathname.endsWith("/oauth2/register") &&
    !url.pathname.endsWith("/oauth2/consent")
  ) {
    return null;
  }

  const tenant = await resolveTenantFromHost(request.headers.get("host"));
  if (!tenant) return oauthError("invalid_request", "Unknown tenant host", 404);

  const expectedResource = resourceUrlForRequest(request);
  if (url.pathname.endsWith("/oauth2/authorize")) {
    if (request.method !== "GET") return null;
    const sessionError = await validateTenantSession(request, false);
    if (sessionError) return sessionError;
    if (url.searchParams.get("resource") !== expectedResource) {
      return oauthError(
        "invalid_target",
        `resource must exactly match ${expectedResource}`,
      );
    }
    if (
      !url.searchParams.get("code_challenge") ||
      url.searchParams.get("code_challenge_method")?.toUpperCase() !== "S256"
    ) {
      return oauthError(
        "invalid_request",
        "S256 PKCE code_challenge is required",
      );
    }
    if (
      !(await clientBelongsToTenant(
        url.searchParams.get("client_id"),
        tenant.id,
      ))
    ) {
      return oauthError(
        "invalid_client",
        "Client is not registered for this tenant",
      );
    }
    return null;
  }

  if (url.pathname.endsWith("/oauth2/register")) {
    if (request.method !== "POST") return null;
    let body: Record<string, unknown> | null;
    try {
      body = parseJsonObject(await request.clone().text());
    } catch {
      return oauthError("invalid_request", "Registration body must be JSON");
    }
    if (!body) {
      return oauthError(
        "invalid_request",
        "Registration body must be a JSON object",
      );
    }
    const policyError = validateDynamicRegistration(body);
    return policyError
      ? oauthError(policyError.error, policyError.description)
      : null;
  }

  if (url.pathname.endsWith("/oauth2/consent")) {
    if (request.method !== "POST") return null;
    return validateConsentBinding(request, tenant.id, expectedResource);
  }

  if (request.method !== "POST") return null;
  let form: URLSearchParams;
  try {
    form = await parseOAuthForm(request);
  } catch {
    return oauthError("invalid_request", "Body must be form-encoded");
  }
  if (form.get("resource") !== expectedResource) {
    return oauthError(
      "invalid_target",
      `resource must exactly match ${expectedResource}`,
    );
  }
  const clientId = clientIdFromRequest(form, request);
  if (!(await clientBelongsToTenant(clientId, tenant.id))) {
    return oauthError(
      "invalid_client",
      "Client is not registered for this tenant",
    );
  }
  const clientAuthError = await validateClientAuthentication(
    form,
    request,
    tenant.id,
  );
  if (clientAuthError) return clientAuthError;
  if (
    form.get("grant_type") === "authorization_code" &&
    !form.get("code_verifier")
  ) {
    return oauthError("invalid_request", "code_verifier is required");
  }
  if (form.get("grant_type") === "authorization_code" && clientId) {
    const codeError = await validateAuthorizationCodeBinding(
      form,
      tenant.id,
      expectedResource,
      clientId,
    );
    if (codeError) return codeError;
  }
  if (form.get("grant_type") === "refresh_token") {
    const validated = await validateRefreshToken(
      form,
      tenant.id,
      expectedResource,
      clientId,
    );
    if (validated) return validated;
  }
  return null;
}
