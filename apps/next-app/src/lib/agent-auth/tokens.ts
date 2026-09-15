import "server-only";

import { db, resolveTenantFromHost } from "@repo/database";
import { member, organization, user } from "@repo/database/schema";
import {
  agentRegistration,
  agentToken,
} from "@repo/database/schema-agent-auth";
import { and, eq, isNull } from "drizzle-orm";
import { type JWTPayload, jwtVerify } from "jose";
import { requestOriginForRequest, resourceUrlForRequest } from "./discovery";
import { AgentAuthConfigurationError, getSigningKey } from "./keys";
import { isRegistrationUsable, resolveScopes } from "./registrations";

export type AgentTokenContext = {
  credentialId: string;
  registrationId: string;
  tenantId: string;
  userId: string | null;
  organizationId: string | null;
  scope: string;
  status: string;
};

/**
 * Verify an agent access token (JWT bearer) issued by /oauth2/token.
 * Returns the registration context, or null when the token is not a valid
 * unrevoked agent token. Signature + expiry are checked via jose; revocation
 * and registration liveness are checked against the database.
 */
export async function verifyAgentAccessToken(
  req: Request,
): Promise<AgentTokenContext | null> {
  const authz = req.headers.get("authorization") ?? "";
  const match = authz.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  // Agent tokens are compact JWS; opaque account tokens (cet_/clm_) are not.
  if (token.startsWith("cet_") || token.startsWith("clm_")) return null;

  const tenant = await resolveTenantFromHost(req.headers.get("host"));
  if (!tenant) return null;
  const resource = resourceUrlForRequest(req);

  let payload: JWTPayload;
  try {
    const { publicKey } = await getSigningKey();
    const issuer = requestOriginForRequest(req);
    const verified = await jwtVerify(token, publicKey, {
      issuer,
      audience: resource,
    });
    if ((verified.protectedHeader.typ ?? "").toLowerCase() !== "at+jwt")
      return null;
    payload = verified.payload;
  } catch (error) {
    // Keep an unavailable production signing key distinguishable from an
    // invalid bearer token. The MCP adapter maps this configuration failure to
    // a retryable 503, while opaque OAuth/account tokens can still fall through
    // to their own verifiers.
    if (
      error instanceof AgentAuthConfigurationError &&
      token.split(".").length === 3
    ) {
      throw error;
    }
    return null;
  }

  const jti = String(payload.jti ?? "");
  if (!jti) return null;

  const [issuedToken] = await db()
    .select({
      id: agentToken.id,
      tenantId: agentToken.tenantId,
      registrationId: agentToken.registrationId,
      scope: agentToken.scope,
      expiresAt: agentToken.expiresAt,
      resource: agentToken.resource,
    })
    .from(agentToken)
    .where(and(eq(agentToken.jti, jti), isNull(agentToken.revokedAt)))
    .limit(1);

  if (!issuedToken || issuedToken.expiresAt.getTime() <= Date.now()) {
    return null;
  }
  if (issuedToken.resource !== resource) return null;

  const tokenTenantId = String(payload.tid ?? "");
  if (issuedToken.tenantId !== tenant.id || tokenTenantId !== tenant.id) {
    return null;
  }

  const registrationId = String(payload.sub ?? "");
  const [registration] = await db()
    .select()
    .from(agentRegistration)
    .where(
      and(
        eq(agentRegistration.id, registrationId),
        eq(agentRegistration.tenantId, tenant.id),
      ),
    )
    .limit(1);
  if (!registration) return null;
  if (issuedToken.registrationId !== registration.id) return null;
  if (!isRegistrationUsable(registration)) return null;

  if (registration.userId) {
    const [linkedUser] = await db()
      .select({ tenantId: user.tenantId, archivedAt: user.archivedAt })
      .from(user)
      .where(eq(user.id, registration.userId))
      .limit(1);
    if (
      !linkedUser ||
      linkedUser.archivedAt !== null ||
      linkedUser.tenantId !== tenant.id
    ) {
      return null;
    }

    if (registration.organizationId) {
      const [membership] = await db()
        .select({ id: member.id })
        .from(member)
        .innerJoin(organization, eq(member.organizationId, organization.id))
        .where(
          and(
            eq(member.userId, registration.userId),
            eq(member.organizationId, registration.organizationId),
            eq(member.tenantId, tenant.id),
            eq(organization.tenantId, tenant.id),
            eq(organization.status, "active"),
          ),
        )
        .limit(1);
      if (!membership) return null;
    }
  }

  // A token's scope is immutable at issuance. Intersect it with the current
  // registration scope so a later scope reduction cannot be bypassed by an
  // older token, and never derive privileges from mutable registration data
  // alone.
  const allowedScopes = new Set(resolveScopes(registration).split(" "));
  const scope = issuedToken.scope
    .split(" ")
    .filter((value) => value && allowedScopes.has(value))
    .join(" ");
  if (!scope) return null;

  return {
    credentialId: issuedToken.id,
    registrationId: registration.id,
    tenantId: registration.tenantId,
    userId: registration.userId,
    organizationId: registration.organizationId,
    scope,
    status: registration.status,
  };
}

export function hasScope(ctx: AgentTokenContext, scope: string): boolean {
  return ctx.scope.split(" ").includes(scope);
}
