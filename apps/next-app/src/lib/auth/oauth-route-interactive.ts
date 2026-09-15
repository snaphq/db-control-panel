import {
  requestOriginForRequest,
  resourceUrlForRequest,
} from "@/lib/agent-auth/discovery";
import { getSigningKey } from "@/lib/agent-auth/keys";
import { isSafeRedirectUri } from "@/lib/agent-auth/oauth-policy";
import {
  invalidUserInfoToken,
  oauthAudience,
  oauthError,
  oauthRedirectResponse,
  parseEndSessionQuery,
  parseOAuthForm,
  validateTenantSession,
} from "@/lib/auth/oauth-route-utils";
import {
  auth,
  getBetterAuthServer,
  runWithAuthTenantContext,
} from "@repo/auth/server";
import { db } from "@repo/database";
import {
  oauthAccessToken,
  oauthApplication,
  user,
} from "@repo/database/schema";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { decodeJwt, jwtVerify } from "jose";
import { NextResponse } from "next/server";

export async function handleTenantBoundUserInfo(
  request: Request,
  tenantId: string,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, POST" },
    });
  }
  const authorization = request.headers.get("authorization") ?? "";
  let token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1] ?? null;
  if (!token && request.method === "POST") {
    try {
      token = (await parseOAuthForm(request)).get("access_token");
    } catch {
      return invalidUserInfoToken("access_token is required");
    }
  }
  if (!token) return invalidUserInfoToken("Bearer access token is required");

  const resource = resourceUrlForRequest(request);
  const [row] = await db()
    .select({
      accessTokenExpiresAt: oauthAccessToken.accessTokenExpiresAt,
      clientId: oauthAccessToken.clientId,
      clientDisabled: oauthApplication.disabled,
      clientRecordId: oauthApplication.id,
      resource: oauthAccessToken.resource,
      revokedAt: oauthAccessToken.revokedAt,
      scopes: oauthAccessToken.scopes,
      userId: oauthAccessToken.userId,
      userEmail: user.publicEmail,
      userEmailVerified: user.emailVerified,
      userImage: user.image,
      userName: user.name,
      userTenantId: user.tenantId,
    })
    .from(oauthAccessToken)
    .leftJoin(
      oauthApplication,
      and(
        eq(oauthApplication.clientId, oauthAccessToken.clientId),
        eq(oauthApplication.tenantId, oauthAccessToken.tenantId),
      ),
    )
    .innerJoin(user, eq(user.id, oauthAccessToken.userId))
    .where(
      and(
        eq(oauthAccessToken.accessToken, token),
        eq(oauthAccessToken.tenantId, tenantId),
        isNull(oauthAccessToken.revokedAt),
      ),
    )
    .limit(1);

  if (
    !row ||
    !row.userId ||
    !row.clientId ||
    !row.clientRecordId ||
    row.clientDisabled === true ||
    row.revokedAt !== null ||
    !row.accessTokenExpiresAt ||
    row.accessTokenExpiresAt.getTime() <= Date.now() ||
    row.resource !== resource ||
    row.userTenantId !== tenantId
  ) {
    return invalidUserInfoToken("Access token is invalid or expired");
  }

  const scopes = new Set((row.scopes ?? "").split(/\s+/).filter(Boolean));
  const body: Record<string, unknown> = { sub: row.userId };
  if (scopes.has("email")) {
    body.email = row.userEmail;
    body.email_verified = row.userEmailVerified;
  }
  if (scopes.has("profile")) {
    body.name = row.userName;
    body.picture = row.userImage;
    const [givenName, ...familyName] = row.userName.split(/\s+/);
    body.given_name = givenName;
    body.family_name = familyName.join(" ") || undefined;
  }

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
  });
}

export async function handleTenantBoundClient(
  request: Request,
  tenantId: string,
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET" },
    });
  }
  const sessionError = await validateTenantSession(request, true);
  if (sessionError) return sessionError;

  const marker = "/oauth2/client/";
  const pathname = new URL(request.url).pathname;
  const encodedClientId = pathname.slice(
    pathname.indexOf(marker) + marker.length,
  );
  let clientId: string;
  try {
    clientId = decodeURIComponent(encodedClientId);
  } catch {
    return oauthError("not_found", "Client not found", 404);
  }
  if (!clientId || clientId.includes("/")) {
    return oauthError("not_found", "Client not found", 404);
  }

  const [client] = await db()
    .select({
      clientId: oauthApplication.clientId,
      disabled: oauthApplication.disabled,
      icon: oauthApplication.icon,
      name: oauthApplication.name,
      userId: oauthApplication.userId,
    })
    .from(oauthApplication)
    .where(
      and(
        eq(oauthApplication.clientId, clientId),
        eq(oauthApplication.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (!client || client.disabled === true || !client.clientId) {
    return oauthError("not_found", "Client not found", 404);
  }
  if (client.userId) {
    const [owner] = await db()
      .select({ tenantId: user.tenantId, archivedAt: user.archivedAt })
      .from(user)
      .where(eq(user.id, client.userId))
      .limit(1);
    if (!owner || owner.archivedAt !== null || owner.tenantId !== tenantId) {
      return oauthError("not_found", "Client not found", 404);
    }
  }

  return NextResponse.json(
    { clientId: client.clientId, name: client.name, icon: client.icon ?? null },
    { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}

export async function handleTenantBoundEndSession(
  request: Request,
  tenantId: string,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, POST" },
    });
  }

  let query: URLSearchParams;
  try {
    query = await parseEndSessionQuery(request);
  } catch {
    return oauthError("invalid_request", "Invalid end-session request");
  }

  const clientId = query.get("client_id")?.trim() || null;
  const idTokenHint = query.get("id_token_hint")?.trim() || null;
  const postLogoutRedirectUri =
    query.get("post_logout_redirect_uri")?.trim() || null;
  const state = query.get("state");
  const origin = requestOriginForRequest(request);

  let client: {
    clientId: string;
    clientSecret: string | null;
    redirectUrls: string | null;
    disabled: boolean | null;
  } | null = null;
  const loadClient = async (id: string): Promise<typeof client> => {
    const [row] = await db()
      .select({
        clientId: oauthApplication.clientId,
        clientSecret: oauthApplication.clientSecret,
        disabled: oauthApplication.disabled,
        redirectUrls: oauthApplication.redirectUrls,
      })
      .from(oauthApplication)
      .where(
        and(
          eq(oauthApplication.clientId, id),
          eq(oauthApplication.tenantId, tenantId),
        ),
      )
      .limit(1);
    if (!row || !row.clientId || row.disabled === true) return null;
    return row as NonNullable<typeof client>;
  };

  if (clientId) {
    client = await loadClient(clientId);
    if (!client) return oauthError("invalid_client", "Invalid client_id");
  }

  let hintedUserId: string | null = null;
  let hintedClientId: string | null = null;
  if (idTokenHint) {
    try {
      const decoded = decodeJwt(idTokenHint);
      hintedClientId = oauthAudience(decoded.aud);
      if (hintedClientId && clientId && hintedClientId !== clientId) {
        return oauthError(
          "invalid_request",
          "client_id does not match the ID Token audience",
        );
      }
      const resolvedClientId = clientId ?? hintedClientId;
      if (resolvedClientId && !client)
        client = await loadClient(resolvedClientId);

      let verified: { payload: { sub?: string } } | null = null;
      if (client) {
        try {
          // New responses are ES256 and can be verified against the service
          // key. Keep the HS256 fallback for tokens issued before this route
          // started normalizing Better Auth responses.
          const { publicKey } = await getSigningKey();
          verified = await jwtVerify(idTokenHint, publicKey, {
            algorithms: ["ES256"],
            audience: client.clientId,
            issuer: origin,
          });
        } catch {
          if (client.clientSecret) {
            verified = await jwtVerify(
              idTokenHint,
              new TextEncoder().encode(client.clientSecret),
              { algorithms: ["HS256"], audience: client.clientId },
            );
          }
        }
      }
      if (verified?.payload.sub && typeof verified.payload.sub === "string") {
        hintedUserId = verified.payload.sub;
      }
    } catch {
      // An invalid hint is ignored unless it is the only way to identify a
      // client for a post-logout redirect. Unverified subject claims are never
      // used to revoke another user's tokens or session.
      hintedUserId = null;
    }
  }

  if (postLogoutRedirectUri) {
    if (!client) {
      return oauthError(
        "invalid_request",
        "client_id is required when using post_logout_redirect_uri",
      );
    }
    const registeredUris = (client.redirectUrls ?? "")
      .split(",")
      .map((uri) => uri.trim())
      .filter(Boolean);
    if (
      !isSafeRedirectUri(postLogoutRedirectUri) ||
      !registeredUris.includes(postLogoutRedirectUri)
    ) {
      return oauthError(
        "invalid_request",
        "post_logout_redirect_uri is not registered for this client",
      );
    }
  }

  const session = await auth.api.getSession({
    headers: new Headers(request.headers),
  });
  if (hintedUserId && session?.user?.id && hintedUserId !== session.user.id) {
    return oauthError(
      "invalid_request",
      "ID Token subject does not match the active session",
    );
  }
  const targetUserId = hintedUserId ?? session?.user?.id ?? null;
  if (targetUserId) {
    const [targetUser] = await db()
      .select({ tenantId: user.tenantId, archivedAt: user.archivedAt })
      .from(user)
      .where(eq(user.id, targetUserId))
      .limit(1);
    if (
      !targetUser ||
      targetUser.archivedAt !== null ||
      targetUser.tenantId !== tenantId
    ) {
      return oauthError(
        "invalid_request",
        "End-user is not active on this tenant",
      );
    }
    await db()
      .update(oauthAccessToken)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(oauthAccessToken.userId, targetUserId),
          eq(oauthAccessToken.tenantId, tenantId),
          isNull(oauthAccessToken.revokedAt),
        ),
      );
  }

  let signOutResponse: Response | undefined;
  if (session?.user?.id) {
    signOutResponse = await runWithAuthTenantContext(
      { tenantId, resource: resourceUrlForRequest(request) },
      () =>
        getBetterAuthServer()
          .getAuthInstance()
          .api.signOut({
            headers: new Headers(request.headers),
            asResponse: true,
          }),
    );
    if (!signOutResponse?.ok) {
      return oauthError(
        "temporarily_unavailable",
        "Unable to complete end-user logout",
        503,
      );
    }
  }

  if (postLogoutRedirectUri) {
    const redirect = new URL(postLogoutRedirectUri);
    if (state) redirect.searchParams.set("state", state);
    return oauthRedirectResponse(redirect.toString(), signOutResponse);
  }
  const setCookie = signOutResponse?.headers.get("set-cookie");
  return NextResponse.json(
    { success: true, message: "Logout successful" },
    {
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        ...(setCookie ? { "set-cookie": setCookie } : {}),
      },
    },
  );
}
