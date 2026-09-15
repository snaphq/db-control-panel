import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import {
  requestOriginForRequest,
  resourceUrlForRequest,
} from "@/lib/agent-auth/discovery";
import {
  type DatabaseTransaction,
  buildTenantAuthEmail,
  db,
  withDbTransaction,
} from "@repo/database";
import { user } from "@repo/database/schema";
import {
  type AgentRegistration,
  agentDelegation,
  agentRegistration,
} from "@repo/database/schema-agent-auth";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { JWTPayload } from "jose";
import { NextResponse } from "next/server";
import { recordAudit } from "./audit";
import { verifyIdJag } from "./id-jag";
import { issueStepUp } from "./identity-assertion-step-up";
import { signIdentityAssertion } from "./keys";
import { isRegistrationUsable } from "./registration-policy";
import {
  POST_CLAIM_SCOPES,
  REGISTRATION_TTL_DAYS,
  clientIp,
  newClaimToken,
  newRegistrationId,
} from "./registrations";

/**
 * Handle type: identity_assertion — provider-minted ID-JAG.
 * Resolution order: delegation match → verified-email step-up → JIT.
 */
export async function registerIdentityAssertion(
  request: Request,
  body: { assertion?: string; assertion_type?: string },
  tenantId: string,
  resource = resourceUrlForRequest(request),
): Promise<Response> {
  const assertion = body.assertion;
  if (!assertion || typeof assertion !== "string") {
    return NextResponse.json(
      { error: "invalid_request", message: "assertion is required" },
      { status: 400 },
    );
  }

  const ip = clientIp(request);
  const result = await verifyIdJag(
    tenantId,
    assertion,
    body.assertion_type,
    resource,
  );
  if (!result.ok) {
    const body: Record<string, unknown> = {
      error: result.error,
      error_description: result.message,
    };
    if (result.error === "login_required") {
      body.max_age = Number(process.env.ID_JAG_MAX_AUTH_AGE_SECONDS ?? 3600);
    }
    return NextResponse.json(body, {
      status: result.status ?? 400,
      headers: {
        "WWW-Authenticate": `AgentAuth error="${result.error}", error_description="${result.message}"`,
      },
    });
  }

  const { payload, provider } = result;
  const email = String(payload.email).trim().toLowerCase();
  const subject = String(payload.sub ?? "");
  if (!subject) {
    return NextResponse.json(
      { error: "invalid_request", message: "Assertion sub is required" },
      { status: 400 },
    );
  }
  const aud = resource;
  const issuer = requestOriginForRequest(request);

  await recordAudit({
    tenantId,
    event: "registration.created",
    email,
    issuer: provider.issuer,
    subject,
    metadata: {
      registration_type: "identity_assertion",
      agent_platform: provider.displayName,
      agent_context_id: typeof payload.jti === "string" ? payload.jti : null,
    },
    ip,
  });

  const registration = await resolveIdentityRegistration({
    tenantId,
    email,
    issuer: provider.issuer,
    subject,
    audience: aud,
    providerId: provider.id,
    request,
    resource,
  });

  const registeredResource =
    registration.metadata &&
    typeof registration.metadata === "object" &&
    "resource" in registration.metadata &&
    typeof registration.metadata.resource === "string"
      ? registration.metadata.resource
      : null;
  if (registeredResource !== resource) {
    return NextResponse.json(
      {
        error: "invalid_target",
        message: "Registration is bound to a different MCP resource",
      },
      { status: 400 },
    );
  }
  if (!isRegistrationUsable(registration)) {
    return NextResponse.json(
      {
        error: "invalid_grant",
        message: "Registration is no longer active",
      },
      { status: 400 },
    );
  }
  if (registration.status === "claimed" && registration.userId) {
    return issueCleanAssertion(registration, email, ip, resource, issuer);
  }
  if (registration.status === "unclaimed") {
    // Repeat presentation during step-up: re-issue a fresh ceremony.
    return issueStepUp(
      registration,
      provider.displayName,
      ip,
      resource,
      issuer,
    );
  }
  return NextResponse.json(
    { error: "invalid_grant", message: "Registration is no longer active" },
    { status: 400 },
  );
}

/**
 * Resolve or create the registration under a transaction-scoped advisory lock.
 * The database uniqueness constraint prevents duplicate rows, while the lock
 * makes concurrent JIT requests deterministic and avoids orphaning a user
 * when two requests present the same provider subject at once.
 */
async function resolveIdentityRegistration(params: {
  tenantId: string;
  email: string;
  issuer: string;
  subject: string;
  audience: string;
  providerId: string;
  request: Request;
  resource: string;
}): Promise<AgentRegistration> {
  return withDbTransaction(async (tx) => {
    const lockKey = `agent-identity:${params.tenantId}:${params.issuer}:${params.subject}`;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );

    const [existing] = await tx
      .select()
      .from(agentRegistration)
      .where(
        and(
          eq(agentRegistration.tenantId, params.tenantId),
          eq(agentRegistration.issuer, params.issuer),
          eq(agentRegistration.subject, params.subject),
        ),
      )
      .limit(1);
    if (existing) return existing;

    const [delegation] = await tx
      .select()
      .from(agentDelegation)
      .where(
        and(
          eq(agentDelegation.tenantId, params.tenantId),
          eq(agentDelegation.issuer, params.issuer),
          eq(agentDelegation.subject, params.subject),
          eq(agentDelegation.audience, params.audience),
        ),
      )
      .limit(1);
    if (delegation) {
      return createRegistration(tx, {
        tenantId: params.tenantId,
        type: "identity_assertion",
        status: "claimed",
        userId: delegation.userId,
        issuer: params.issuer,
        subject: params.subject,
        providerId: params.providerId,
        scopes: POST_CLAIM_SCOPES,
        resource: params.resource,
        request: params.request,
      });
    }

    // Verified-email match -> first-link step-up. Never silently bind an
    // existing account to a provider subject.
    const [emailMatch] = await tx
      .select({ id: user.id })
      .from(user)
      .where(
        and(
          eq(user.publicEmail, params.email),
          eq(user.tenantId, params.tenantId),
        ),
      )
      .limit(1);
    if (emailMatch) {
      return createRegistration(tx, {
        tenantId: params.tenantId,
        type: "identity_assertion",
        status: "unclaimed",
        claimEmail: params.email,
        issuer: params.issuer,
        subject: params.subject,
        providerId: params.providerId,
        resource: params.resource,
        request: params.request,
      });
    }

    // No match -> JIT provision a minimal user. If another subject raced us
    // to the same email, treat that user as an existing-account match and
    // retain the step-up requirement rather than issuing a silent link.
    const userId = `usr_${randomBytes(12).toString("base64url")}`;
    const [createdUser] = await tx
      .insert(user)
      .values({
        id: userId,
        tenantId: params.tenantId,
        name: params.email.split("@")[0],
        publicEmail: params.email,
        email: buildTenantAuthEmail(params.tenantId, params.email),
        emailVerified: true,
        role: "user",
      })
      .onConflictDoNothing()
      .returning({ id: user.id });
    if (!createdUser) {
      const [racedUser] = await tx
        .select({ id: user.id })
        .from(user)
        .where(
          and(
            eq(user.publicEmail, params.email),
            eq(user.tenantId, params.tenantId),
          ),
        )
        .limit(1);
      if (!racedUser) throw new Error("JIT user creation conflict");
      return createRegistration(tx, {
        tenantId: params.tenantId,
        type: "identity_assertion",
        status: "unclaimed",
        claimEmail: params.email,
        issuer: params.issuer,
        subject: params.subject,
        providerId: params.providerId,
        resource: params.resource,
        request: params.request,
      });
    }

    const registration = await createRegistration(tx, {
      tenantId: params.tenantId,
      type: "identity_assertion",
      status: "claimed",
      userId: createdUser.id,
      issuer: params.issuer,
      subject: params.subject,
      providerId: params.providerId,
      scopes: POST_CLAIM_SCOPES,
      resource: params.resource,
      request: params.request,
    });
    await tx
      .insert(agentDelegation)
      .values({
        id: `del_${randomUUID()}`,
        tenantId: params.tenantId,
        issuer: params.issuer,
        subject: params.subject,
        audience: params.audience,
        userId: createdUser.id,
        registrationId: registration.id,
      })
      .onConflictDoNothing();
    return registration;
  });
}

async function createRegistration(
  database: DatabaseTransaction,
  params: {
    tenantId: string;
    type: string;
    status: string;
    userId?: string;
    claimEmail?: string;
    issuer: string;
    subject: string;
    providerId: string;
    scopes?: string;
    resource: string;
    request: Request;
  },
): Promise<AgentRegistration> {
  const id = newRegistrationId();
  const claimToken = newClaimToken();
  await database.insert(agentRegistration).values({
    id,
    tenantId: params.tenantId,
    type: params.type,
    status: params.status,
    userId: params.userId ?? null,
    claimEmail: params.claimEmail ?? null,
    claimTokenHash: claimToken.hash,
    claimTokenExpiresAt: claimToken.expiresAt,
    claimExpiresAt: params.status === "unclaimed" ? claimToken.expiresAt : null,
    registrationExpiresAt: new Date(
      Date.now() + REGISTRATION_TTL_DAYS * 24 * 60 * 60 * 1000,
    ),
    issuer: params.issuer,
    subject: params.subject,
    providerId: params.providerId,
    scopes: params.scopes ?? POST_CLAIM_SCOPES,
    registrationIp: clientIp(params.request),
    userAgent: params.request.headers.get("user-agent"),
    metadata: { request_id: randomUUID(), resource: params.resource },
  });

  const [row] = await database
    .select()
    .from(agentRegistration)
    .where(
      and(
        eq(agentRegistration.id, id),
        eq(agentRegistration.tenantId, params.tenantId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new Error("Agent registration was not created");
  }
  return row;
}

async function issueCleanAssertion(
  registration: AgentRegistration,
  email: string,
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
  if (!registration.userId) {
    return NextResponse.json(
      {
        error: "invalid_grant",
        message: "Registration is not linked to an active account",
      },
      { status: 400 },
    );
  }
  const [linkedUser] = await db()
    .select({
      archivedAt: user.archivedAt,
      publicEmail: user.publicEmail,
      tenantId: user.tenantId,
    })
    .from(user)
    .where(
      and(
        eq(user.id, registration.userId),
        eq(user.tenantId, registration.tenantId),
      ),
    )
    .limit(1);
  if (!linkedUser || linkedUser.archivedAt !== null) {
    return NextResponse.json(
      {
        error: "invalid_grant",
        message: "Linked account is no longer active",
      },
      { status: 400 },
    );
  }
  const canonicalEmail = linkedUser.publicEmail.trim().toLowerCase();
  if (!canonicalEmail) {
    return NextResponse.json(
      {
        error: "invalid_grant",
        message: "Linked account has no usable email address",
      },
      { status: 400 },
    );
  }
  // The provider subject/delegation is the stable identity binding. A changed
  // provider email must never overwrite the application's canonical actor
  // address, so issue the assertion with the linked user's email instead.
  const providerEmailMismatch = canonicalEmail !== email;
  const assertion = await signIdentityAssertion({
    registrationId: registration.id,
    scopes: registration.scopes,
    registrationType: registration.type,
    resource,
    issuer,
    email: canonicalEmail,
    emailVerified: true,
  });
  const now = new Date();
  const [updated] = await db()
    .update(agentRegistration)
    .set({ assertionExpiresAt: assertion.expiresAt })
    .where(
      and(
        eq(agentRegistration.id, registration.id),
        eq(agentRegistration.tenantId, registration.tenantId),
        eq(agentRegistration.status, "claimed"),
        eq(agentRegistration.userId, registration.userId),
        or(
          isNull(agentRegistration.registrationExpiresAt),
          gt(agentRegistration.registrationExpiresAt, now),
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

  await recordAudit({
    tenantId: registration.tenantId,
    event: "assertion.issued",
    registrationId: registration.id,
    metadata: {
      assertion_expires: assertion.expiresAt.toISOString(),
      provider_email_mismatch: providerEmailMismatch,
    },
    ip,
  });

  return NextResponse.json({
    registration_id: registration.id,
    registration_type: registration.type,
    identity_assertion: assertion.jwt,
    assertion_expires: assertion.expiresAt.toISOString(),
    scopes: registration.scopes.split(" "),
  });
}
