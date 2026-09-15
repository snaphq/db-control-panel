import { recordAudit } from "@/lib/agent-auth/audit";
import {
  REVOKED_EVENT_SCHEMA,
  eventNotificationUrlForRequest,
} from "@/lib/agent-auth/discovery";
import {
  findTrustedProvider,
  getProviderKeyResolver,
} from "@/lib/agent-auth/providers";
import { db, resolveTenantFromHost } from "@repo/database";
import {
  agentJtiSeen,
  agentRegistration,
  agentToken,
} from "@repo/database/schema-agent-auth";
import { and, eq, isNull } from "drizzle-orm";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

function setError(err: string, description: string): NextResponse {
  return NextResponse.json(
    { error: err, error_description: description },
    { status: 400 },
  );
}

/**
 * POST /agent/event/notify — RFC 8935 push delivery of a Security Event Token
 * (RFC 8417). Currently handles the identity-assertion-revoked event: kills
 * the registration and every token derived from it. Unknown event schemas are
 * ignored (RFC 8417 §2.2). 202 Accepted on success, no body.
 */
export async function POST(request: Request): Promise<Response> {
  const tenant = await resolveTenantFromHost(request.headers.get("host"));
  if (!tenant) {
    return setError("invalid_request", "Unknown tenant host");
  }

  const body = await request.text();
  if (!body) {
    return setError("invalid_request", "Missing SET body");
  }

  let header: { typ?: string };
  let payload: {
    iss?: string;
    sub?: string;
    aud?: string | string[];
    jti?: string;
    iat?: number;
    events?: Record<string, unknown>;
  };
  try {
    const parts = body.split(".");
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
      throw new Error("SET must be a compact JWT");
    }
    const [h, p] = parts;
    header = JSON.parse(Buffer.from(h, "base64url").toString());
    payload = JSON.parse(Buffer.from(p, "base64url").toString());
  } catch {
    return setError("invalid_request", "Malformed SET");
  }

  const issuer = payload.iss ?? "";
  const provider = issuer ? await findTrustedProvider(tenant.id, issuer) : null;
  if (!provider) {
    return setError("invalid_issuer", "Issuer is not on the trust list");
  }

  const expectedAudience = eventNotificationUrlForRequest(request);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (
    !audiences.some(
      (audience) =>
        typeof audience === "string" && audience === expectedAudience,
    )
  ) {
    return setError("invalid_audience", "aud does not match this service");
  }

  if ((header.typ ?? "").toLowerCase() !== "secevent+jwt") {
    return setError("invalid_request", "Expected typ secevent+jwt");
  }
  if (typeof payload.jti !== "string" || payload.jti.length === 0) {
    return setError("invalid_request", "SET jti is required");
  }
  if (typeof payload.iat !== "number" || !Number.isFinite(payload.iat)) {
    return setError("invalid_request", "SET iat is required");
  }

  try {
    const getKey = getProviderKeyResolver(provider);
    await jwtVerify(body, getKey, {
      issuer: provider.issuer,
      audience: expectedAudience,
    });
  } catch {
    return setError(
      "authentication_failed",
      "SET signature verification failed",
    );
  }

  const events = payload.events;
  if (!events || typeof events !== "object" || Array.isArray(events)) {
    return setError("invalid_request", "SET events is required");
  }

  // Replay protection on the SET jti. Every accepted SET must carry a jti;
  // otherwise a signed notification could be replayed indefinitely. Consume
  // it only after the payload shape is valid, so malformed signed input cannot
  // burn an otherwise usable notification identifier. Include the trusted
  // issuer to avoid unrelated provider namespaces colliding in one tenant.
  const inserted = await db()
    .insert(agentJtiSeen)
    .values({
      jti: `set:${tenant.id}:${provider.issuer}:${payload.jti}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    .onConflictDoNothing()
    .returning({ jti: agentJtiSeen.jti });
  if (inserted.length === 0) {
    return setError("invalid_request", "Duplicate jti");
  }

  if (REVOKED_EVENT_SCHEMA in events) {
    const revokedSubject = payload.sub;
    if (typeof revokedSubject !== "string" || revokedSubject.length === 0) {
      return setError(
        "invalid_request",
        "sub is required for identity assertion revocation events",
      );
    }
    const registrations = await db()
      .select()
      .from(agentRegistration)
      .where(
        and(
          eq(agentRegistration.tenantId, tenant.id),
          eq(agentRegistration.issuer, provider.issuer),
          eq(agentRegistration.subject, revokedSubject),
        ),
      );

    await Promise.all(
      registrations
        .filter((registration) => registration.status !== "revoked")
        .map(async (registration) => {
          // The two revocation writes target independent rows. Complete both
          // before recording the audit event so the audit remains an accurate
          // statement about the resulting state.
          await Promise.all([
            db()
              .update(agentRegistration)
              .set({ status: "revoked" })
              .where(
                and(
                  eq(agentRegistration.id, registration.id),
                  eq(agentRegistration.tenantId, tenant.id),
                ),
              ),
            db()
              .update(agentToken)
              .set({ revokedAt: new Date() })
              .where(
                and(
                  eq(agentToken.registrationId, registration.id),
                  eq(agentToken.tenantId, tenant.id),
                  isNull(agentToken.revokedAt),
                ),
              ),
          ]);
          await recordAudit({
            tenantId: registration.tenantId,
            event: "registration.revoked",
            registrationId: registration.id,
            issuer: provider.issuer,
            subject: revokedSubject,
            metadata: { set_jti: payload.jti ?? null },
          });
        }),
    );
  }

  return new NextResponse(null, { status: 202 });
}
