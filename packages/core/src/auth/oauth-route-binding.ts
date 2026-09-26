import { db, resolveTenantFromHost, withDbTransaction } from "@repo/database";
import {
  oauthAccessToken,
  oauthApplication,
  oauthConsent,
  user,
  verification,
} from "@repo/database/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  requestOriginForRequest,
  resourceUrlForRequest,
} from "../agent-auth/discovery";
import {
  oauthError,
  parseVerificationValue,
  resignOidcIdToken,
  responseWithJson,
} from "./oauth-route-utils";
import { clientBelongsToTenant } from "./oauth-route-validation";

async function quarantineIssuedToken(
  accessToken: string,
  tenantId: string,
): Promise<void> {
  try {
    await db()
      .update(oauthAccessToken)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(oauthAccessToken.accessToken, accessToken),
          isNull(oauthAccessToken.revokedAt),
          eq(oauthAccessToken.tenantId, tenantId),
        ),
      );
  } catch {
    // The protocol response remains fail-closed if the database itself is
    // unavailable: no token is returned to the caller.
  }
}

async function quarantineRefreshToken(
  refreshToken: string | null,
  tenantId: string,
): Promise<void> {
  if (!refreshToken) return;
  try {
    await db()
      .update(oauthAccessToken)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(oauthAccessToken.refreshToken, refreshToken),
          isNull(oauthAccessToken.revokedAt),
          eq(oauthAccessToken.tenantId, tenantId),
        ),
      );
  } catch {
    // Best effort: the response is already being failed closed.
  }
}

/** Bind a Better Auth response to the tenant/resource that handled it. */
export async function bindMcpOAuthResponse(
  request: Request,
  response: Response,
  tokenForm?: URLSearchParams,
): Promise<Response> {
  const url = new URL(request.url);
  if (!response.ok) return response;

  const tenant = await resolveTenantFromHost(request.headers.get("host"));
  if (!tenant) return oauthError("invalid_request", "Unknown tenant host", 404);

  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }

  if (url.pathname.endsWith("/oauth2/register")) {
    const clientId =
      payload && typeof payload === "object" && "client_id" in payload
        ? (payload as { client_id?: unknown }).client_id
        : null;
    if (typeof clientId !== "string" || !clientId) return response;

    const result = await withDbTransaction(async (tx) => {
      const [client] = await tx
        .select({
          id: oauthApplication.id,
          tenantId: oauthApplication.tenantId,
          userId: oauthApplication.userId,
        })
        .from(oauthApplication)
        .where(eq(oauthApplication.clientId, clientId))
        .limit(1);
      if (!client) return "missing" as const;
      // `default` is a real tenant id, not an unbound sentinel. A row created
      // without the request tenant context must never be reassigned to the
      // first non-default host that observes it.
      if (client.tenantId !== tenant.id) return "mismatch" as const;

      if (client.userId) {
        const [registeredUser] = await tx
          .select({ tenantId: user.tenantId, archivedAt: user.archivedAt })
          .from(user)
          .where(eq(user.id, client.userId))
          .limit(1);
        if (
          !registeredUser ||
          registeredUser.archivedAt !== null ||
          registeredUser.tenantId !== tenant.id
        ) {
          await tx
            .update(oauthApplication)
            .set({ disabled: true })
            .where(eq(oauthApplication.id, client.id));
          return "invalid_user" as const;
        }
      }
      return "bound" as const;
    });

    if (result === "mismatch" || result === "invalid_user") {
      return oauthError(
        "invalid_client",
        "Client is not registered for this tenant",
      );
    }
    if (result === "missing") {
      return oauthError(
        "temporarily_unavailable",
        "Client tenant binding unavailable",
        503,
      );
    }
    return response;
  }

  if (url.pathname.endsWith("/oauth2/consent")) {
    const redirectUri =
      payload && typeof payload === "object" && "redirectURI" in payload
        ? (payload as { redirectURI?: unknown }).redirectURI
        : null;
    if (typeof redirectUri !== "string" || !redirectUri) return response;
    const redirect = new URL(redirectUri);
    const code = redirect.searchParams.get("code");
    // Denied consent redirects contain no authorization code and create no
    // consent row, so there is nothing to bind.
    if (!code) return response;

    const [verificationRow] = await db()
      .select({ value: verification.value, tenantId: verification.tenantId })
      .from(verification)
      .where(
        and(
          eq(verification.identifier, code),
          eq(verification.tenantId, tenant.id),
        ),
      )
      .limit(1);
    const verificationValue = verificationRow
      ? parseVerificationValue(verificationRow.value)
      : null;
    const clientId =
      typeof verificationValue?.clientId === "string"
        ? verificationValue.clientId
        : null;
    const userId =
      typeof verificationValue?.userId === "string"
        ? verificationValue.userId
        : null;
    const resource =
      typeof verificationValue?.resource === "string"
        ? verificationValue.resource
        : null;
    if (
      !verificationRow ||
      verificationRow.tenantId !== tenant.id ||
      !clientId ||
      !userId ||
      resource !== resourceUrlForRequest(request) ||
      !(await clientBelongsToTenant(clientId, tenant.id))
    ) {
      return oauthError(
        "temporarily_unavailable",
        "Consent binding unavailable",
        503,
      );
    }

    const result = await withDbTransaction(async (tx) => {
      const [consent] = await tx
        .select({
          id: oauthConsent.id,
          tenantId: oauthConsent.tenantId,
          resource: oauthConsent.resource,
        })
        .from(oauthConsent)
        .where(
          and(
            eq(oauthConsent.clientId, clientId),
            eq(oauthConsent.userId, userId),
            eq(oauthConsent.consentGiven, true),
            eq(oauthConsent.tenantId, tenant.id),
          ),
        )
        .orderBy(desc(oauthConsent.createdAt))
        .limit(1);
      if (!consent) return "missing" as const;
      if (
        consent.resource &&
        consent.resource !== resourceUrlForRequest(request)
      ) {
        return "mismatch" as const;
      }
      if (
        consent.tenantId === tenant.id &&
        consent.resource === resourceUrlForRequest(request)
      ) {
        return "bound" as const;
      }
      const [bound] = await tx
        .update(oauthConsent)
        .set({
          tenantId: tenant.id,
          resource: resourceUrlForRequest(request),
        })
        .where(
          and(
            eq(oauthConsent.id, consent.id),
            eq(oauthConsent.tenantId, tenant.id),
          ),
        )
        .returning({ id: oauthConsent.id });
      return bound ? ("bound" as const) : ("missing" as const);
    });
    if (result === "mismatch") {
      return oauthError(
        "invalid_target",
        "Consent is bound to another MCP resource",
      );
    }
    if (result === "missing") {
      return oauthError(
        "temporarily_unavailable",
        "Consent binding unavailable",
        503,
      );
    }
    return response;
  }

  if (!url.pathname.endsWith("/oauth2/token")) return response;
  if (!payload || typeof payload !== "object" || !("access_token" in payload)) {
    return response;
  }
  const accessToken = (payload as { access_token?: unknown }).access_token;
  if (typeof accessToken !== "string" || !accessToken) return response;

  if (!tokenForm) {
    await quarantineIssuedToken(accessToken, tenant.id);
    return oauthError(
      "temporarily_unavailable",
      "Token binding unavailable",
      503,
    );
  }
  const grantType = tokenForm.get("grant_type");
  const presentedRefreshToken = tokenForm.get("refresh_token")?.trim() ?? null;
  const responseResource = resourceUrlForRequest(request);

  try {
    await withDbTransaction(async (tx) => {
      const [issued] = await tx
        .select({
          id: oauthAccessToken.id,
          tenantId: oauthAccessToken.tenantId,
          clientId: oauthAccessToken.clientId,
          userId: oauthAccessToken.userId,
          resource: oauthAccessToken.resource,
        })
        .from(oauthAccessToken)
        .where(eq(oauthAccessToken.accessToken, accessToken))
        .limit(1);
      if (!issued) throw new Error("issued token row missing");
      if (issued.tenantId !== tenant.id) {
        throw new Error("issued token belongs to another tenant");
      }
      if (!issued.resource) {
        throw new Error("issued token has no resource binding");
      }
      if (issued.resource !== responseResource) {
        throw new Error("issued token belongs to another resource");
      }
      if (!issued.clientId) throw new Error("issued token client missing");

      const [client] = await tx
        .select({
          id: oauthApplication.id,
          disabled: oauthApplication.disabled,
        })
        .from(oauthApplication)
        .where(
          and(
            eq(oauthApplication.clientId, issued.clientId),
            eq(oauthApplication.tenantId, tenant.id),
          ),
        )
        .limit(1);
      if (!client || client.disabled === true) {
        throw new Error("issued token client is unavailable");
      }
      if (issued.userId) {
        const [issuedUser] = await tx
          .select({ tenantId: user.tenantId, archivedAt: user.archivedAt })
          .from(user)
          .where(eq(user.id, issued.userId))
          .limit(1);
        if (
          !issuedUser ||
          issuedUser.archivedAt !== null ||
          issuedUser.tenantId !== tenant.id
        ) {
          throw new Error("issued token user is unavailable");
        }
      }

      const [bound] = await tx
        .update(oauthAccessToken)
        .set({ tenantId: tenant.id, resource: responseResource })
        .where(
          and(
            eq(oauthAccessToken.id, issued.id),
            eq(oauthAccessToken.tenantId, tenant.id),
            isNull(oauthAccessToken.revokedAt),
          ),
        )
        .returning({ id: oauthAccessToken.id });
      if (!bound) throw new Error("issued token binding lost");

      if (grantType === "refresh_token") {
        if (!presentedRefreshToken) {
          throw new Error("refresh token missing");
        }
        const [rotated] = await tx
          .update(oauthAccessToken)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(oauthAccessToken.refreshToken, presentedRefreshToken),
              eq(oauthAccessToken.tenantId, tenant.id),
              eq(oauthAccessToken.clientId, issued.clientId),
              eq(oauthAccessToken.resource, responseResource),
              isNull(oauthAccessToken.revokedAt),
            ),
          )
          .returning({ id: oauthAccessToken.id });
        if (!rotated) throw new Error("refresh token rotation lost");
      }
    });
  } catch {
    await quarantineIssuedToken(accessToken, tenant.id);
    if (grantType === "refresh_token") {
      await quarantineRefreshToken(presentedRefreshToken, tenant.id);
    }
    return oauthError(
      "temporarily_unavailable",
      "Token binding unavailable; retry the exchange",
      503,
    );
  }

  const responsePayload: Record<string, unknown> = {
    ...(payload as Record<string, unknown>),
    resource: responseResource,
  };
  if (typeof responsePayload.id_token === "string") {
    try {
      responsePayload.id_token = await resignOidcIdToken(
        responsePayload.id_token,
        requestOriginForRequest(request),
      );
    } catch {
      await quarantineIssuedToken(accessToken, tenant.id);
      if (grantType === "refresh_token") {
        await quarantineRefreshToken(presentedRefreshToken, tenant.id);
      }
      return oauthError(
        "temporarily_unavailable",
        "Unable to bind the ID token to this tenant",
        503,
      );
    }
  }

  return responseWithJson(response, responsePayload);
}
