import { randomUUID } from "node:crypto";
import { recordAudit } from "@/lib/agent-auth/audit";
import { mintClaimAttempt } from "@/lib/agent-auth/claims";
import {
  requestOriginForRequest,
  resourceUrlForRequest,
} from "@/lib/agent-auth/discovery";
import { registerIdentityAssertion } from "@/lib/agent-auth/identity-assertion";
import { signIdentityAssertion } from "@/lib/agent-auth/keys";
import { checkAgentIdentityRateLimit } from "@/lib/agent-auth/rate-limit";
import {
  CLAIM_TOKEN_TTL_MS,
  PRE_CLAIM_SCOPES,
  REGISTRATION_TTL_DAYS,
  clientIp,
  expireStaleRegistrations,
  newClaimToken,
  newRegistrationId,
} from "@/lib/agent-auth/registrations";
import { db, resolveTenantFromHost } from "@repo/database";
import { agentRegistration } from "@repo/database/schema-agent-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /agent/identity — agentic registration (auth.md protocol).
 * Dispatches on `type`: anonymous | service_auth | identity_assertion.
 */
export async function POST(request: Request): Promise<Response> {
  const tenant = await resolveTenantFromHost(request.headers.get("host"));
  if (!tenant) {
    return NextResponse.json(
      { error: "tenant_not_found", message: "Unknown tenant host" },
      { status: 404 },
    );
  }
  const resource = resourceUrlForRequest(request);
  const issuer = requestOriginForRequest(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Body must be JSON" },
      { status: 400 },
    );
  }

  const { type } = (body ?? {}) as {
    type?: string;
    assertion?: string;
    assertion_type?: string;
  };

  if (
    type === "anonymous" ||
    type === "service_auth" ||
    type === "identity_assertion"
  ) {
    // Two-tier rate limiting (per-IP); production fails closed if its
    // distributed limiter or trusted client address is unavailable.
    const allowed = await checkAgentIdentityRateLimit(clientIp(request), type);
    if (!allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "Too many registration attempts" },
        { status: 429 },
      );
    }
  }

  if (type === "identity_assertion") {
    return registerIdentityAssertion(
      request,
      {
        assertion: (body as { assertion?: string }).assertion,
        assertion_type: (body as { assertion_type?: string }).assertion_type,
      },
      tenant.id,
      resource,
    );
  }
  if (type !== "anonymous" && type !== "service_auth") {
    return NextResponse.json(
      {
        error: "invalid_request",
        message:
          "type must be one of: anonymous, identity_assertion, service_auth",
      },
      { status: 400 },
    );
  }

  await expireStaleRegistrations(tenant.id);

  if (type === "service_auth") {
    return registerServiceAuth(
      request,
      body as { login_hint?: string },
      tenant.id,
      resource,
      issuer,
    );
  }
  return registerAnonymous(request, tenant.id, resource, issuer);
}

async function registerAnonymous(
  request: Request,
  tenantId: string,
  resource: string,
  issuer: string,
): Promise<Response> {
  const id = newRegistrationId();
  const claimToken = newClaimToken();
  const registrationExpiresAt = new Date(
    Date.now() + REGISTRATION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  await db()
    .insert(agentRegistration)
    .values({
      id,
      tenantId,
      type: "anonymous",
      status: "unclaimed",
      claimTokenHash: claimToken.hash,
      claimTokenExpiresAt: claimToken.expiresAt,
      claimExpiresAt: claimToken.expiresAt,
      registrationExpiresAt,
      preClaimScopes: PRE_CLAIM_SCOPES,
      scopes: PRE_CLAIM_SCOPES,
      registrationIp: clientIp(request),
      userAgent: request.headers.get("user-agent"),
      metadata: { request_id: randomUUID(), resource },
    });

  const assertion = await signIdentityAssertion({
    registrationId: id,
    scopes: PRE_CLAIM_SCOPES,
    registrationType: "anonymous",
    resource,
    issuer,
  });

  await recordAudit({
    tenantId,
    event: "registration.created",
    registrationId: id,
    metadata: { registration_type: "anonymous" },
    ip: clientIp(request),
  });
  await recordAudit({
    tenantId,
    event: "assertion.issued",
    registrationId: id,
    metadata: { assertion_expires: assertion.expiresAt.toISOString() },
  });

  return NextResponse.json({
    registration_id: id,
    registration_type: "anonymous",
    identity_assertion: assertion.jwt,
    assertion_expires: assertion.expiresAt.toISOString(),
    pre_claim_scopes: PRE_CLAIM_SCOPES.split(" "),
    claim_url: new URL("/agent/identity/claim", issuer).toString(),
    claim_token: claimToken.plaintext,
    claim_token_expires: new Date(
      Date.now() + CLAIM_TOKEN_TTL_MS,
    ).toISOString(),
    post_claim_scopes: ["api.read", "api.write"],
  });
}

async function registerServiceAuth(
  request: Request,
  body: { login_hint?: string },
  tenantId: string,
  resource: string,
  issuer: string,
): Promise<Response> {
  const loginHint =
    typeof body.login_hint === "string"
      ? body.login_hint.trim().toLowerCase()
      : "";
  if (!loginHint || !loginHint.includes("@")) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: "service_auth requires a valid login_hint email",
      },
      { status: 400 },
    );
  }

  const id = newRegistrationId();
  const claimToken = newClaimToken();
  const registrationExpiresAt = new Date(
    Date.now() + REGISTRATION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  await db()
    .insert(agentRegistration)
    .values({
      id,
      tenantId,
      type: "service_auth",
      status: "unclaimed",
      claimEmail: loginHint,
      claimTokenHash: claimToken.hash,
      claimTokenExpiresAt: claimToken.expiresAt,
      claimExpiresAt: claimToken.expiresAt,
      registrationExpiresAt,
      scopes: PRE_CLAIM_SCOPES,
      registrationIp: clientIp(request),
      userAgent: request.headers.get("user-agent"),
      metadata: { request_id: randomUUID(), resource },
    });

  const attempt = await mintClaimAttempt({
    registration: { id, tenantId },
    origin: issuer,
    ip: clientIp(request),
  });

  await recordAudit({
    tenantId,
    event: "registration.created",
    registrationId: id,
    email: loginHint,
    metadata: { registration_type: "service_auth" },
    ip: clientIp(request),
  });
  await recordAudit({
    tenantId,
    event: "claim.requested",
    registrationId: id,
    email: loginHint,
    ip: clientIp(request),
  });

  return NextResponse.json({
    registration_id: id,
    registration_type: "service_auth",
    claim_url: new URL("/agent/identity/claim", issuer).toString(),
    claim_token: claimToken.plaintext,
    claim_token_expires: new Date(
      Date.now() + CLAIM_TOKEN_TTL_MS,
    ).toISOString(),
    post_claim_scopes: ["api.read", "api.write"],
    claim: {
      user_code: attempt.userCode,
      expires_in: Math.max(
        0,
        Math.floor((attempt.expiresAt.getTime() - Date.now()) / 1000),
      ),
      verification_uri: attempt.verificationUri,
      interval: attempt.interval,
    },
  });
}
