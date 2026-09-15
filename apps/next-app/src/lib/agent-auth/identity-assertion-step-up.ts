import { db } from "@repo/database";
import {
  type AgentRegistration,
  agentRegistration,
} from "@repo/database/schema-agent-auth";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { recordAudit } from "./audit";
import {
  ClaimRegistrationUnavailableError,
  POLL_INTERVAL_SECONDS,
  mintClaimAttempt,
} from "./claims";
import type { MintedClaimAttempt } from "./claims";
import { isRegistrationUsable } from "./registration-policy";
import {
  CLAIM_TOKEN_TTL_MS,
  POST_CLAIM_SCOPES,
  newClaimToken,
} from "./registrations";

/** 401 interaction_required: user must confirm linking at the claim page. */
export async function issueStepUp(
  registration: AgentRegistration,
  providerDisplayName: string,
  ip: string | null,
  resource: string,
  issuer: string,
): Promise<Response> {
  if (!isRegistrationUsable(registration)) {
    return NextResponse.json(
      {
        error: "invalid_grant",
        message: "Registration is no longer active",
      },
      { status: 400 },
    );
  }
  if (!registration.claimTokenHash) {
    return NextResponse.json(
      {
        error: "invalid_grant",
        message: "Registration is missing an active claim token",
      },
      { status: 400 },
    );
  }
  const claimToken = newClaimToken();
  const [updated] = await db()
    .update(agentRegistration)
    .set({
      claimTokenHash: claimToken.hash,
      claimTokenExpiresAt: claimToken.expiresAt,
      claimExpiresAt: claimToken.expiresAt,
    })
    .where(
      and(
        eq(agentRegistration.id, registration.id),
        eq(agentRegistration.tenantId, registration.tenantId),
        eq(agentRegistration.status, "unclaimed"),
        eq(agentRegistration.claimTokenHash, registration.claimTokenHash),
        or(
          isNull(agentRegistration.registrationExpiresAt),
          gt(agentRegistration.registrationExpiresAt, new Date()),
        ),
      ),
    )
    .returning({ id: agentRegistration.id });

  if (!updated) {
    return NextResponse.json(
      {
        error: "invalid_grant",
        message: "Registration is no longer awaiting a claim",
      },
      { status: 400 },
    );
  }

  let attempt: MintedClaimAttempt;
  try {
    attempt = await mintClaimAttempt({
      registration: { id: registration.id, tenantId: registration.tenantId },
      origin: issuer,
      ip,
    });
  } catch (error) {
    if (error instanceof ClaimRegistrationUnavailableError) {
      return NextResponse.json(
        {
          error: "invalid_grant",
          message: "Registration is no longer awaiting a claim",
        },
        { status: 400 },
      );
    }
    throw error;
  }

  await recordAudit({
    tenantId: registration.tenantId,
    event: "claim.requested",
    registrationId: registration.id,
    email: registration.claimEmail,
    metadata: { step_up: true, provider: providerDisplayName },
    ip,
  });

  return NextResponse.json(
    {
      error: "interaction_required",
      error_description:
        "The asserted identity matches an existing account; the user must confirm linking.",
      registration_id: registration.id,
      registration_type: registration.type,
      resource,
      claim_url: new URL("/agent/identity/claim", issuer).toString(),
      claim_token: claimToken.plaintext,
      claim_token_expires: new Date(
        Date.now() + CLAIM_TOKEN_TTL_MS,
      ).toISOString(),
      post_claim_scopes: POST_CLAIM_SCOPES.split(" "),
      claim: {
        user_code: attempt.userCode,
        expires_in: Math.max(
          0,
          Math.floor((attempt.expiresAt.getTime() - Date.now()) / 1000),
        ),
        verification_uri: attempt.verificationUri,
        interval: attempt.interval ?? POLL_INTERVAL_SECONDS,
      },
    },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": 'AgentAuth error="interaction_required"',
      },
    },
  );
}
