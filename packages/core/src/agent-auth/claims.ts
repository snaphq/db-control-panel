import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { db, withDbTransaction } from "@repo/database";
import { member, organization, user } from "@repo/database/schema";
import {
  agentClaimAttempt,
  agentDelegation,
  agentRegistration,
  agentToken,
} from "@repo/database/schema-agent-auth";
import type { AgentRegistration } from "@repo/database/schema-agent-auth";
import { and, eq, isNull, sql } from "drizzle-orm";
import { recordAudit } from "./audit";
import { MAX_CODE_ATTEMPTS, isClaimAttemptUsable } from "./claim-policy";
import { verificationUriFor } from "./claim-uri";
import { sha256Hex, signIdentityAssertion } from "./keys";
import { isRegistrationUsable } from "./registration-policy";
import {
  POST_CLAIM_SCOPES,
  USER_CODE_TTL_MS,
  newUserCode,
} from "./registrations";

export const POLL_INTERVAL_SECONDS = 5;
export { isClaimAttemptUsable, MAX_CODE_ATTEMPTS } from "./claim-policy";

export type MintedClaimAttempt = {
  claimAttemptId: string;
  attemptToken: string;
  userCode: string;
  expiresAt: Date;
  verificationUri: string;
  interval: number;
};

export class ClaimRegistrationUnavailableError extends Error {
  constructor() {
    super("Registration is no longer awaiting a claim.");
    this.name = "ClaimRegistrationUnavailableError";
  }
}

/**
 * Mint a fresh claim attempt for a registration. Any previous attempt's
 * verification_uri stops working (new attempt_token + user_code are issued).
 */
export async function mintClaimAttempt(params: {
  registration: Pick<AgentRegistration, "id" | "tenantId">;
  /** Public origin that owns the registration and verification ceremony. */
  origin: string;
  ip?: string | null;
}): Promise<MintedClaimAttempt> {
  const attemptToken = `cat_${randomBytes(24).toString("base64url")}`;
  const userCode = newUserCode();
  const expiresAt = new Date(Date.now() + USER_CODE_TTL_MS);
  const id = `cla_${randomUUID()}`;

  await withDbTransaction(async (tx) => {
    // Serialize remints for this registration. Without a row lock, two
    // concurrent requests can both observe the old attempt as live and issue
    // two valid verification URIs; the older one would then remain usable.
    await tx.execute(sql`
      SELECT ${agentRegistration.id}
      FROM ${agentRegistration}
      WHERE ${agentRegistration.id} = ${params.registration.id}
        AND ${agentRegistration.tenantId} = ${params.registration.tenantId}
      FOR UPDATE
    `);

    const [registration] = await tx
      .select({
        status: agentRegistration.status,
        registrationExpiresAt: agentRegistration.registrationExpiresAt,
        claimExpiresAt: agentRegistration.claimExpiresAt,
        userId: agentRegistration.userId,
      })
      .from(agentRegistration)
      .where(
        and(
          eq(agentRegistration.id, params.registration.id),
          eq(agentRegistration.tenantId, params.registration.tenantId),
        ),
      )
      .limit(1);
    if (
      !registration ||
      registration.status !== "unclaimed" ||
      !isRegistrationUsable(registration)
    ) {
      throw new ClaimRegistrationUnavailableError();
    }

    // A registration has exactly one live user-code attempt. Close older
    // attempts before inserting the replacement so a previously issued
    // verification URI cannot be replayed after a re-mint.
    await tx
      .update(agentClaimAttempt)
      .set({ status: "expired" })
      .where(
        and(
          eq(agentClaimAttempt.registrationId, params.registration.id),
          eq(agentClaimAttempt.tenantId, params.registration.tenantId),
          eq(agentClaimAttempt.status, "initiated"),
        ),
      );

    await tx.insert(agentClaimAttempt).values({
      id,
      tenantId: params.registration.tenantId,
      registrationId: params.registration.id,
      attemptTokenHash: sha256Hex(attemptToken),
      userCodeHash: sha256Hex(userCode),
      status: "initiated",
      expiresAt,
    });

    await tx
      .update(agentRegistration)
      .set({ lastPollAt: null })
      .where(
        and(
          eq(agentRegistration.id, params.registration.id),
          eq(agentRegistration.tenantId, params.registration.tenantId),
        ),
      );
  });

  await recordAudit({
    tenantId: params.registration.tenantId,
    event: "user_code.minted",
    registrationId: params.registration.id,
    ip: params.ip ?? null,
  });

  return {
    claimAttemptId: id,
    attemptToken,
    userCode,
    expiresAt,
    verificationUri: verificationUriFor(attemptToken, params.origin),
    interval: POLL_INTERVAL_SECONDS,
  };
}

/** verification_uri routes through sign-in so the user authenticates first. */
export { verificationUriFor } from "./claim-uri";

export type ClaimCompleteResult =
  | { ok: true; registrationId: string }
  | { ok: false; error: string; message: string };

/**
 * Complete a claim attempt: verify code, enforce the email binding, flip the
 * registration to claimed, swap scopes, and revoke pre-claim tokens.
 */
export async function completeClaim(params: {
  attemptToken: string;
  userCode: string;
  userId: string;
  userEmail: string;
  tenantId: string;
  /** Exact MCP resource and issuer used when the registration was created. */
  resource: string;
  issuer: string;
  ip?: string | null;
}): Promise<ClaimCompleteResult> {
  const result = await withDbTransaction(async (tx) => {
    const [claimingUser] = await tx
      .select({ tenantId: user.tenantId, archivedAt: user.archivedAt })
      .from(user)
      .where(eq(user.id, params.userId))
      .limit(1);
    if (
      !claimingUser ||
      claimingUser.archivedAt !== null ||
      claimingUser.tenantId !== params.tenantId
    ) {
      return {
        ok: false as const,
        error: "forbidden",
        message: "Your account cannot claim this registration.",
      };
    }

    const [attempt] = await tx
      .select()
      .from(agentClaimAttempt)
      .where(
        and(
          eq(
            agentClaimAttempt.attemptTokenHash,
            sha256Hex(params.attemptToken),
          ),
          eq(agentClaimAttempt.tenantId, params.tenantId),
        ),
      )
      .limit(1);
    if (!attempt) {
      return {
        ok: false as const,
        error: "invalid_request",
        message: "Unknown claim attempt.",
      };
    }

    // Serialize completion against remint/revocation. The attempt lookup is
    // intentionally followed by a registration-row lock so a concurrent
    // mint cannot expire this attempt after the status checks below.
    await tx.execute(sql`
      SELECT ${agentRegistration.id}
      FROM ${agentRegistration}
      WHERE ${agentRegistration.id} = ${attempt.registrationId}
        AND ${agentRegistration.tenantId} = ${params.tenantId}
      FOR UPDATE
    `);

    const [registration] = await tx
      .select()
      .from(agentRegistration)
      .where(
        and(
          eq(agentRegistration.id, attempt.registrationId),
          eq(agentRegistration.tenantId, params.tenantId),
        ),
      )
      .limit(1);
    if (!registration || registration.status !== "unclaimed") {
      return {
        ok: false as const,
        error: "claimed_or_in_flight",
        message: "This registration is not awaiting a claim.",
      };
    }

    const registeredResource =
      registration.metadata &&
      typeof registration.metadata === "object" &&
      "resource" in registration.metadata &&
      typeof registration.metadata.resource === "string"
        ? registration.metadata.resource
        : null;
    if (!registeredResource || registeredResource !== params.resource) {
      return {
        ok: false as const,
        error: "invalid_request",
        message: "The claim must be completed on the registration's MCP host.",
      };
    }

    const now = new Date();
    if (
      (registration.claimExpiresAt && registration.claimExpiresAt <= now) ||
      (registration.registrationExpiresAt &&
        registration.registrationExpiresAt <= now)
    ) {
      return {
        ok: false as const,
        error: "claim_expired",
        message: "The claim window has closed.",
      };
    }

    // Only the bound human may complete the ceremony.
    if (
      registration.claimEmail &&
      registration.claimEmail.toLowerCase() !== params.userEmail.toLowerCase()
    ) {
      return {
        ok: false as const,
        error: "forbidden",
        message: `This code can only be claimed by ${registration.claimEmail}. You are signed in as ${params.userEmail}.`,
      };
    }

    if (!isClaimAttemptUsable(attempt, now)) {
      if (
        attempt.status === "initiated" &&
        attempt.expiresAt.getTime() > now.getTime() &&
        attempt.failedAttempts >= MAX_CODE_ATTEMPTS
      ) {
        return {
          ok: false as const,
          error: "expired_token",
          message:
            "Too many incorrect attempts. Ask your agent for a new code.",
        };
      }
      return {
        ok: false as const,
        error: "expired_token",
        message: "This code has expired. Ask your agent for a new one.",
      };
    }

    if (attempt.userCodeHash !== sha256Hex(params.userCode)) {
      // Keep the increment tenant- and state-bound, and do it as an atomic SQL
      // expression so concurrent wrong codes cannot overwrite each other's
      // counters.
      await tx
        .update(agentClaimAttempt)
        .set({ failedAttempts: sql`${agentClaimAttempt.failedAttempts} + 1` })
        .where(
          and(
            eq(agentClaimAttempt.id, attempt.id),
            eq(agentClaimAttempt.tenantId, params.tenantId),
            eq(agentClaimAttempt.status, "initiated"),
            sql`${agentClaimAttempt.failedAttempts} < ${MAX_CODE_ATTEMPTS}`,
          ),
        );
      return {
        ok: false as const,
        error: "invalid_code",
        message: "Incorrect code.",
      };
    }

    const organizationId = await resolvePrimaryOrganization(
      params.userId,
      params.tenantId,
      tx,
    );

    if (!organizationId) {
      return {
        ok: false as const,
        error: "organization_required",
        message: "Choose an organization before completing the claim.",
      };
    }

    const [completedAttempt] = await tx
      .update(agentClaimAttempt)
      .set({
        status: "completed",
        completedByUserId: params.userId,
        completedAt: now,
        completedIp: params.ip ?? null,
      })
      .where(
        and(
          eq(agentClaimAttempt.id, attempt.id),
          eq(agentClaimAttempt.tenantId, params.tenantId),
          eq(agentClaimAttempt.status, "initiated"),
        ),
      )
      .returning({ id: agentClaimAttempt.id });

    // A claim code is one-shot. The conditional update closes the race where
    // two requests present the same valid code concurrently.
    if (!completedAttempt) {
      return {
        ok: false as const,
        error: "claimed_or_in_flight",
        message: "This claim attempt has already been completed.",
      };
    }

    const postClaimScopes = registration.postClaimScopes || POST_CLAIM_SCOPES;
    const [claimedRegistration] = await tx
      .update(agentRegistration)
      .set({
        status: "claimed",
        userId: params.userId,
        organizationId,
        scopes: postClaimScopes,
        firstLinkedAt: registration.type === "identity_assertion" ? now : null,
      })
      .where(
        and(
          eq(agentRegistration.id, registration.id),
          eq(agentRegistration.tenantId, params.tenantId),
          eq(agentRegistration.status, "unclaimed"),
        ),
      )
      .returning({ id: agentRegistration.id });
    if (!claimedRegistration) {
      return {
        ok: false as const,
        error: "claimed_or_in_flight",
        message: "This registration has already been claimed.",
      };
    }

    // ID-JAG step-up confirmed: persist the (iss, sub, aud) -> user delegation.
    if (
      registration.type === "identity_assertion" &&
      registration.issuer &&
      registration.subject
    ) {
      await tx
        .insert(agentDelegation)
        .values({
          id: `del_${randomUUID()}`,
          tenantId: registration.tenantId,
          issuer: registration.issuer,
          subject: registration.subject,
          audience: params.resource,
          userId: params.userId,
          registrationId: registration.id,
        })
        .onConflictDoNothing();
    }

    // Anonymous: pre-claim access_tokens are revoked — the canonical credential
    // is the post-claim token returned by the claim grant poll.
    await tx
      .update(agentToken)
      .set({ revokedAt: now })
      .where(
        and(
          eq(agentToken.registrationId, registration.id),
          eq(agentToken.tenantId, params.tenantId),
          isNull(agentToken.revokedAt),
        ),
      );

    const assertion = await signIdentityAssertion({
      registrationId: registration.id,
      scopes: postClaimScopes,
      registrationType: registration.type,
      resource: params.resource,
      issuer: params.issuer,
      email: params.userEmail,
      emailVerified: true,
    });
    await tx
      .update(agentRegistration)
      .set({ assertionExpiresAt: assertion.expiresAt })
      .where(
        and(
          eq(agentRegistration.id, registration.id),
          eq(agentRegistration.tenantId, params.tenantId),
          eq(agentRegistration.status, "claimed"),
        ),
      );

    return {
      ok: true as const,
      registrationId: registration.id,
      email: registration.claimEmail,
    };
  });

  if (result.ok) {
    await recordAudit({
      tenantId: params.tenantId,
      event: "claim.confirmed",
      registrationId: result.registrationId,
      email: result.email,
      metadata: { claimed_by_user_id: params.userId },
      ip: params.ip ?? null,
    });
    return { ok: true, registrationId: result.registrationId };
  }

  return result;
}

async function resolvePrimaryOrganization(
  userId: string,
  tenantId: string,
  database: Pick<ReturnType<typeof db>, "select"> = db(),
): Promise<string | null> {
  const memberships = await database
    .select({
      organizationId: member.organizationId,
      memberTenantId: member.tenantId,
      organizationTenantId: organization.tenantId,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(
      and(
        eq(member.userId, userId),
        eq(member.tenantId, tenantId),
        eq(organization.tenantId, tenantId),
      ),
    )
    .limit(2);
  return selectPrimaryOrganizationMembership(memberships, tenantId);
}

/**
 * Pick the sole organization membership only when both sides of the
 * membership join agree on the request tenant. Keeping this check separate
 * from the SQL predicate gives malformed legacy rows a second, testable
 * defense if a caller ever supplies a different query adapter.
 */
export function selectPrimaryOrganizationMembership(
  memberships: Array<{
    organizationId: string;
    memberTenantId: string;
    organizationTenantId: string;
  }>,
  tenantId: string,
): string | null {
  const valid = memberships.filter(
    (membership) =>
      membership.memberTenantId === tenantId &&
      membership.organizationTenantId === tenantId,
  );
  return valid.length === 1 ? valid[0].organizationId : null;
}
