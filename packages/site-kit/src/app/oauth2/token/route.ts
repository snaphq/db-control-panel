import { recordAudit } from "@repo/core/agent-auth/audit";
import { POLL_INTERVAL_SECONDS } from "@repo/core/agent-auth/claims";
import {
  GRANT_CLAIM,
  GRANT_JWT_BEARER,
  requestOriginForRequest,
  resourceUrlForRequest,
} from "@repo/core/agent-auth/discovery";
import {
  AgentAuthConfigurationError,
  getSigningKey,
  recordIssuedToken,
  sha256Hex,
  signAccessToken,
  signIdentityAssertion,
} from "@repo/core/agent-auth/keys";
import { boundResourceFromMetadata } from "@repo/core/agent-auth/oauth-policy";
import {
  expireStaleRegistrations,
  getRegistration,
  isRegistrationUsable,
  resolveScopes,
} from "@repo/core/agent-auth/registrations";
import { db, resolveTenantFromHost, withDbTransaction } from "@repo/database";
import {
  agentClaimAttempt,
  agentRegistration,
  agentToken,
} from "@repo/database/schema-agent-auth";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { type JWTPayload, jwtVerify } from "jose";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function oauthError(
  error: string,
  description: string,
  status = 400,
): NextResponse {
  return NextResponse.json(
    { error, error_description: description },
    { status },
  );
}

/**
 * POST /oauth2/token — agent credential issuance (auth.md protocol).
 * Grants: urn:ietf:params:oauth:grant-type:jwt-bearer (RFC 7523) and,
 * from Phase 2, urn:workos:agent-auth:grant-type:claim (ceremony polling).
 */
export async function POST(request: Request): Promise<Response> {
  const tenant = await resolveTenantFromHost(request.headers.get("host"));
  if (!tenant) {
    return oauthError("invalid_request", "Unknown tenant host", 404);
  }

  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return oauthError("invalid_request", "Body must be form-encoded");
  }

  const grantType = form.get("grant_type");
  const expectedResource = resourceUrlForRequest(request);
  if (form.get("resource") !== expectedResource) {
    return oauthError(
      "invalid_target",
      `resource must exactly match ${expectedResource}`,
    );
  }
  if (grantType === GRANT_CLAIM) {
    return handleClaimGrant(
      form,
      tenant.id,
      expectedResource,
      requestOriginForRequest(request),
    );
  }
  if (grantType !== GRANT_JWT_BEARER) {
    return oauthError(
      "unsupported_grant_type",
      `grant_type must be ${GRANT_JWT_BEARER} or ${GRANT_CLAIM}`,
    );
  }

  const assertion = form.get("assertion");
  if (!assertion) {
    return oauthError("invalid_request", "assertion parameter is required");
  }

  await expireStaleRegistrations(tenant.id);

  // Verify the service-signed identity_assertion (typ oauth-id-jag+jwt).
  let publicKey: CryptoKey;
  try {
    ({ publicKey } = await getSigningKey());
  } catch (error) {
    if (error instanceof AgentAuthConfigurationError) {
      return oauthError(
        "temporarily_unavailable",
        "Agent authentication is not configured",
        503,
      );
    }
    throw error;
  }
  const issuer = requestOriginForRequest(request);
  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(assertion, publicKey, {
      issuer,
      audience: expectedResource,
    });
    if (
      (verified.protectedHeader.typ ?? "").toLowerCase() !== "oauth-id-jag+jwt"
    ) {
      return oauthError("invalid_grant", "unexpected assertion typ");
    }
    payload = verified.payload;
  } catch {
    return oauthError(
      "invalid_grant",
      "assertion is invalid, expired or revoked — restart registration at /agent/identity",
    );
  }

  const registration = await getRegistration(
    String(payload.sub ?? ""),
    tenant.id,
  );
  if (!registration) {
    return oauthError("invalid_grant", "registration not found");
  }
  if (!isRegistrationUsable(registration)) {
    return oauthError(
      "invalid_grant",
      registration.status === "revoked"
        ? "registration has been revoked"
        : registration.status === "expired"
          ? "registration has expired"
          : registration.status === "claimed"
            ? "registration is not linked to an active user"
            : "registration has expired",
    );
  }
  if (boundResourceFromMetadata(registration.metadata) !== expectedResource) {
    return oauthError(
      "invalid_target",
      "registration is bound to a different MCP resource",
    );
  }

  const scope = resolveScopes(registration);
  const token = await signAccessToken({
    registrationId: registration.id,
    scope,
    tenantId: registration.tenantId,
    resource: expectedResource,
    issuer,
  });
  await recordIssuedToken({
    tenantId: registration.tenantId,
    registrationId: registration.id,
    jti: token.jti,
    scope,
    resource: expectedResource,
    expiresAt: token.expiresAt,
  });

  await db()
    .update(agentRegistration)
    .set({ lastTokenIssuedAt: new Date() })
    .where(
      and(
        eq(agentRegistration.id, registration.id),
        eq(agentRegistration.tenantId, tenant.id),
      ),
    );

  await recordAudit({
    tenantId: registration.tenantId,
    event: "token.issued",
    registrationId: registration.id,
    metadata: { scope, grant: GRANT_JWT_BEARER },
  });

  return NextResponse.json({
    access_token: token.jwt,
    token_type: "Bearer",
    expires_in: token.expiresIn,
    scope,
    resource: expectedResource,
  });
}

/**
 * Claim-ceremony polling grant (RFC 8628-shaped). Returns authorization_pending
 * while the user has not confirmed, expired_token once windows close, and the
 * standard token response (plus identity_assertion) on success.
 */
async function handleClaimGrant(
  form: URLSearchParams,
  tenantId: string,
  resource: string,
  issuer: string,
): Promise<NextResponse> {
  const claimToken = form.get("claim_token");
  if (!claimToken) {
    return oauthError("invalid_request", "claim_token parameter is required");
  }

  await expireStaleRegistrations(tenantId);

  const [registration] = await db()
    .select()
    .from(agentRegistration)
    .where(
      and(
        eq(agentRegistration.claimTokenHash, sha256Hex(claimToken)),
        eq(agentRegistration.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!registration) {
    return oauthError("expired_token", "The claim ceremony window has closed.");
  }
  if (
    registration.type === "identity_assertion" ||
    !registration.claimTokenExpiresAt ||
    registration.claimTokenExpiresAt.getTime() <= Date.now()
  ) {
    return oauthError("expired_token", "The claim ceremony window has closed.");
  }
  if (!isRegistrationUsable(registration)) {
    return oauthError(
      "expired_token",
      registration.status === "revoked"
        ? "The claim ceremony has been revoked."
        : "The claim ceremony window has closed.",
    );
  }
  if (boundResourceFromMetadata(registration.metadata) !== resource) {
    return oauthError(
      "invalid_target",
      "registration is bound to a different MCP resource",
    );
  }

  // RFC 8628 slow_down: honor the advertised interval. The conditional
  // update makes the check atomic so concurrent pollers cannot both pass
  // after observing the same previous timestamp.
  const pollNow = new Date();
  const pollCutoff = new Date(
    pollNow.getTime() - POLL_INTERVAL_SECONDS * 1000 * 0.8,
  );
  const [polled] = await db()
    .update(agentRegistration)
    .set({ lastPollAt: pollNow })
    .where(
      and(
        eq(agentRegistration.id, registration.id),
        eq(agentRegistration.tenantId, tenantId),
        or(
          isNull(agentRegistration.lastPollAt),
          lt(agentRegistration.lastPollAt, pollCutoff),
        ),
      ),
    )
    .returning({ id: agentRegistration.id });
  if (!polled) {
    return oauthError(
      "slow_down",
      "Polling too fast; add at least 5s to your interval.",
    );
  }

  if (registration.status === "unclaimed") {
    // Pending unless the latest code window lapsed while the outer window is open.
    const [latestAttempt] = await db()
      .select({ expiresAt: agentClaimAttempt.expiresAt })
      .from(agentClaimAttempt)
      .where(
        and(
          eq(agentClaimAttempt.registrationId, registration.id),
          eq(agentClaimAttempt.tenantId, tenantId),
        ),
      )
      .orderBy(desc(agentClaimAttempt.createdAt))
      .limit(1);

    if (!latestAttempt || latestAttempt.expiresAt.getTime() < Date.now()) {
      if (
        registration.claimExpiresAt &&
        registration.claimExpiresAt.getTime() < Date.now()
      ) {
        return oauthError(
          "expired_token",
          "The claim ceremony window has closed.",
        );
      }
      return oauthError(
        "expired_token",
        "The user_code window expired; re-initiate via the claim endpoint for a fresh code.",
      );
    }
    return oauthError(
      "authorization_pending",
      "The user has not yet completed the ceremony.",
    );
  }

  // status === "claimed": issue the post-claim credential. The outer
  // claim_token is a one-shot grant: lock the registration, mint the token
  // and assertion, persist their ledger row, and clear the hash in one
  // transaction. Without this consume step a caller could poll the same
  // claim token repeatedly and receive an unbounded stream of credentials.
  try {
    await getSigningKey();
  } catch (error) {
    if (error instanceof AgentAuthConfigurationError) {
      return oauthError(
        "temporarily_unavailable",
        "Agent authentication is not configured",
        503,
      );
    }
    throw error;
  }
  const consumed = await withDbTransaction(async (tx) => {
    // Keep the lock explicit instead of relying on a non-portable Drizzle
    // `for` shape. The conditional hash check below is the replay guard.
    await tx.execute(sql`
      SELECT ${agentRegistration.id}
      FROM ${agentRegistration}
      WHERE ${agentRegistration.id} = ${registration.id}
        AND ${agentRegistration.tenantId} = ${tenantId}
      FOR UPDATE
    `);

    const [current] = await tx
      .select()
      .from(agentRegistration)
      .where(
        and(
          eq(agentRegistration.id, registration.id),
          eq(agentRegistration.tenantId, tenantId),
          eq(agentRegistration.claimTokenHash, sha256Hex(claimToken)),
          eq(agentRegistration.status, "claimed"),
        ),
      )
      .limit(1);

    if (
      !current ||
      current.type === "identity_assertion" ||
      !current.claimTokenExpiresAt ||
      current.claimTokenExpiresAt.getTime() <= Date.now() ||
      !isRegistrationUsable(current)
    ) {
      return null;
    }

    const scope = resolveScopes(current);
    const [token, assertion] = await Promise.all([
      signAccessToken({
        registrationId: current.id,
        scope,
        tenantId: current.tenantId,
        resource,
        issuer,
      }),
      // Anonymous: v2 assertion carries the user's email; service_auth: first assertion.
      signIdentityAssertion({
        registrationId: current.id,
        scopes: scope,
        registrationType: current.type,
        resource,
        issuer,
        email: current.claimEmail,
        emailVerified: true,
      }),
    ]);

    const [cleared] = await tx
      .update(agentRegistration)
      .set({
        claimTokenHash: null,
        claimTokenExpiresAt: null,
        claimExpiresAt: null,
        lastTokenIssuedAt: new Date(),
        assertionExpiresAt: assertion.expiresAt,
      })
      .where(
        and(
          eq(agentRegistration.id, current.id),
          eq(agentRegistration.tenantId, tenantId),
          eq(agentRegistration.status, "claimed"),
          eq(agentRegistration.claimTokenHash, sha256Hex(claimToken)),
        ),
      )
      .returning({ id: agentRegistration.id });
    if (!cleared) return null;

    await tx.insert(agentToken).values({
      id: `agt_${crypto.randomUUID()}`,
      tenantId: current.tenantId,
      registrationId: current.id,
      jti: token.jti,
      scope,
      resource,
      expiresAt: token.expiresAt,
    });

    return { scope, token, assertion, registrationId: current.id };
  });

  if (!consumed) {
    return oauthError(
      "expired_token",
      "The claim token has already been used or the claim ceremony window has closed.",
    );
  }

  await recordAudit({
    tenantId,
    event: "token.issued",
    registrationId: consumed.registrationId,
    metadata: { scope: consumed.scope, grant: GRANT_CLAIM },
  });

  return NextResponse.json({
    access_token: consumed.token.jwt,
    token_type: "Bearer",
    expires_in: consumed.token.expiresIn,
    scope: consumed.scope,
    resource,
    identity_assertion: consumed.assertion.jwt,
    assertion_expires: consumed.assertion.expiresAt.toISOString(),
  });
}
