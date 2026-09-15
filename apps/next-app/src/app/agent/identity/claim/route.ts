import { recordAudit } from "@/lib/agent-auth/audit";
import {
  ClaimRegistrationUnavailableError,
  mintClaimAttempt,
} from "@/lib/agent-auth/claims";
import type { MintedClaimAttempt } from "@/lib/agent-auth/claims";
import {
  requestOriginForRequest,
  resourceUrlForRequest,
} from "@/lib/agent-auth/discovery";
import { sha256Hex } from "@/lib/agent-auth/keys";
import {
  clientIp,
  expireStaleRegistrations,
  isRegistrationUsable,
} from "@/lib/agent-auth/registrations";
import { db, resolveTenantFromHost } from "@repo/database";
import { agentRegistration } from "@repo/database/schema-agent-auth";
import { and, eq, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /agent/identity/claim — claim ceremony entry + user_code re-mint.
 * Used by anonymous registrations to start the ceremony (with an email
 * binding) and by both anonymous/service_auth to mint a fresh code after
 * expired_token. Body: { claim_token, email }.
 */
export async function POST(request: Request): Promise<Response> {
  const tenant = await resolveTenantFromHost(request.headers.get("host"));
  if (!tenant) {
    return NextResponse.json(
      { error: "tenant_not_found", message: "Unknown tenant host" },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Body must be JSON" },
      { status: 400 },
    );
  }

  const input =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as { claim_token?: unknown; email?: unknown })
      : {};
  const claimToken =
    typeof input.claim_token === "string" ? input.claim_token.trim() : "";
  const email =
    typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!claimToken || !email || !email.includes("@")) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: "claim_token and a valid email are required",
      },
      { status: 400 },
    );
  }

  await expireStaleRegistrations(tenant.id);

  const [registration] = await db()
    .select()
    .from(agentRegistration)
    .where(
      and(
        eq(agentRegistration.claimTokenHash, sha256Hex(claimToken)),
        eq(agentRegistration.tenantId, tenant.id),
      ),
    )
    .limit(1);

  if (!registration) {
    return NextResponse.json(
      { error: "invalid_claim_token", message: "Unknown claim token." },
      { status: 400 },
    );
  }
  if (registration.status === "claimed") {
    return NextResponse.json(
      {
        error: "claimed_or_in_flight",
        message: "This registration has already been claimed.",
      },
      { status: 400 },
    );
  }
  if (!isRegistrationUsable(registration)) {
    return NextResponse.json(
      {
        error: "claim_expired",
        message: "The registration expired before the claim was completed.",
      },
      { status: 410 },
    );
  }

  if (
    registration.claimEmail &&
    registration.claimEmail.toLowerCase() !== email
  ) {
    return NextResponse.json(
      {
        error: "forbidden",
        message: "This registration is already bound to another email.",
      },
      { status: 403 },
    );
  }

  // Bind the registration to the human the agent is acting for.
  const [boundRegistration] = await db()
    .update(agentRegistration)
    .set({ claimEmail: email })
    .where(
      and(
        eq(agentRegistration.id, registration.id),
        eq(agentRegistration.tenantId, tenant.id),
        eq(agentRegistration.status, "unclaimed"),
        // A concurrent request must not be able to rebind an unclaimed
        // registration to a different human after the first email wins.
        or(
          isNull(agentRegistration.claimEmail),
          eq(agentRegistration.claimEmail, email),
        ),
      ),
    )
    .returning({ id: agentRegistration.id });

  if (!boundRegistration) {
    return NextResponse.json(
      {
        error: "claimed_or_in_flight",
        message: "This registration has already been claimed.",
      },
      { status: 409 },
    );
  }

  let attempt: MintedClaimAttempt;
  try {
    attempt = await mintClaimAttempt({
      registration: { id: registration.id, tenantId: tenant.id },
      origin: requestOriginForRequest(request),
      ip: clientIp(request),
    });
  } catch (error) {
    if (error instanceof ClaimRegistrationUnavailableError) {
      return NextResponse.json(
        {
          error: "claimed_or_in_flight",
          message: "This registration has already been claimed.",
        },
        { status: 409 },
      );
    }
    throw error;
  }

  await recordAudit({
    tenantId: registration.tenantId,
    event: "claim.requested",
    registrationId: registration.id,
    email,
    ip: clientIp(request),
  });

  return NextResponse.json({
    registration_id: registration.id,
    claim_attempt_id: attempt.claimAttemptId,
    status: "initiated",
    expires_at: registration.claimExpiresAt?.toISOString() ?? null,
    claim_url: new URL(
      "/agent/identity/claim",
      requestOriginForRequest(request),
    ).toString(),
    claim_attempt: {
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
