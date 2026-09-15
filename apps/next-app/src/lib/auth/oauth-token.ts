import "server-only";

import { resourceUrlForRequest } from "@/lib/agent-auth/discovery";
import { resolveTenantFromHost } from "@repo/database";
import { db } from "@repo/database";
import {
  oauthAccessToken,
  oauthApplication,
  user,
} from "@repo/database/schema";
import { and, eq, isNull } from "drizzle-orm";

export type OAuthMcpTokenContext = {
  tokenId: string;
  clientId: string;
  userId: string;
  tenantId: string;
  scope: string;
  resource: string;
};

/**
 * Verify a Better Auth OIDC access token for the MCP resource.
 *
 * OIDC access tokens are opaque, so signature validation is not possible at
 * the resource server. The ledger row is the source of truth: it must be
 * active, unexpired, issued for this host's MCP resource, bound to an active
 * client and an active user in the current tenant. Scope enforcement is done
 * by the MCP route so a valid token without api.read gets an RFC 6750
 * insufficient_scope response instead of an indistinguishable 401.
 */
export async function verifyOAuthMcpToken(
  request: Request,
): Promise<OAuthMcpTokenContext | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  if (!token || token.startsWith("cet_") || token.startsWith("clm_")) {
    return null;
  }

  const tenant = await resolveTenantFromHost(request.headers.get("host"));
  if (!tenant) return null;
  const resource = resourceUrlForRequest(request);

  const [row] = await db()
    .select({
      id: oauthAccessToken.id,
      accessToken: oauthAccessToken.accessToken,
      clientId: oauthAccessToken.clientId,
      userId: oauthAccessToken.userId,
      scopes: oauthAccessToken.scopes,
      resource: oauthAccessToken.resource,
      accessTokenExpiresAt: oauthAccessToken.accessTokenExpiresAt,
      revokedAt: oauthAccessToken.revokedAt,
      tenantId: oauthAccessToken.tenantId,
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
        eq(oauthAccessToken.accessToken, token),
        eq(oauthAccessToken.tenantId, tenant.id),
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
    !row.accessTokenExpiresAt ||
    row.accessTokenExpiresAt.getTime() <= Date.now() ||
    row.resource !== resource
  ) {
    return null;
  }

  const [userRow] = await db()
    .select({ tenantId: user.tenantId, archivedAt: user.archivedAt })
    .from(user)
    .where(eq(user.id, row.userId))
    .limit(1);
  if (
    !userRow ||
    userRow.archivedAt !== null ||
    userRow.tenantId !== tenant.id
  ) {
    return null;
  }

  const scope = (row.scopes ?? "").split(/\s+/).filter(Boolean).join(" ");

  return {
    tokenId: row.id,
    clientId: row.clientId,
    userId: row.userId,
    tenantId: tenant.id,
    scope,
    resource,
  };
}
