import "server-only";

import { db } from "@repo/database";
import { agentJtiSeen } from "@repo/database/schema-agent-auth";
import { eq } from "drizzle-orm";
import { type JWTPayload, jwtVerify } from "jose";
import { getSiteUrl } from "../site-config";
import {
  type TrustedProvider,
  findTrustedProvider,
  getProviderKeyResolver,
} from "./providers";

export const ID_JAG_TYP = "oauth-id-jag+jwt";
export const ASSERTION_TYPE_ID_JAG = "urn:ietf:params:oauth:token-type:id-jag";

export const ID_JAG_MAX_AUTH_AGE_SECONDS = Number(
  process.env.ID_JAG_MAX_AUTH_AGE_SECONDS ?? 3600,
);
const CLOCK_SKEW_SECONDS = 120;

export type IdJagResult =
  | { ok: true; payload: JWTPayload; provider: TrustedProvider }
  | { ok: false; error: string; status?: number; message: string };

/**
 * Verify a provider-minted ID-JAG against the trust list: signature via the
 * provider JWKS, then aud/iat/jti/email_verified/auth_time claim checks.
 */
export async function verifyIdJag(
  tenantId: string,
  assertion: string,
  assertionType?: string,
  expectedResource?: string,
): Promise<IdJagResult> {
  if (assertionType && assertionType !== ASSERTION_TYPE_ID_JAG) {
    return {
      ok: false,
      error: "invalid_request",
      message: "Unsupported assertion_type",
    };
  }

  // Decode header only (no verify) to reject unknown typ early.
  let header: { typ?: string; alg?: string; kid?: string };
  try {
    header = JSON.parse(
      Buffer.from(assertion.split(".")[0], "base64url").toString(),
    );
  } catch {
    return {
      ok: false,
      error: "invalid_request",
      message: "Malformed assertion",
    };
  }
  if ((header.typ ?? "").toLowerCase() !== ID_JAG_TYP) {
    return {
      ok: false,
      error: "invalid_request",
      message: "Expected typ oauth-id-jag+jwt",
    };
  }

  // Issuer from the unverified payload routes the trust-list lookup; the
  // signature check below still pins iss after verification.
  let unverifiedIss: string;
  try {
    const payloadPart = JSON.parse(
      Buffer.from(assertion.split(".")[1], "base64url").toString(),
    );
    unverifiedIss = String(payloadPart.iss ?? "");
  } catch {
    return {
      ok: false,
      error: "invalid_request",
      message: "Malformed assertion",
    };
  }
  if (!unverifiedIss) {
    return { ok: false, error: "invalid_issuer", message: "Missing iss claim" };
  }

  const provider = await findTrustedProvider(tenantId, unverifiedIss);
  if (!provider) {
    return {
      ok: false,
      error: "issuer_not_enabled",
      message: "Provider is not on this service's trust list",
    };
  }

  let payload: JWTPayload;
  try {
    const getKey = getProviderKeyResolver(provider);
    const verified = await jwtVerify(assertion, getKey, {
      issuer: provider.issuer,
      ...(expectedResource ? { audience: expectedResource } : {}),
      clockTolerance: CLOCK_SKEW_SECONDS,
    });
    payload = verified.payload;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "verification failed";
    if (msg.includes("audience")) {
      return {
        ok: false,
        error: "invalid_audience",
        message: "aud does not match this service",
      };
    }
    if (msg.includes("iat")) {
      return {
        ok: false,
        error: "invalid_request",
        message: "Assertion iat is too far in the future",
      };
    }
    return {
      ok: false,
      error: "invalid_signature",
      message: "Assertion signature verification failed",
    };
  }

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    return {
      ok: false,
      error: "invalid_request",
      message: "Assertion sub is required",
    };
  }
  if (typeof payload.exp !== "number" || typeof payload.iat !== "number") {
    return {
      ok: false,
      error: "invalid_request",
      message: "Assertion must include numeric iat and exp claims",
    };
  }
  if (payload.iat > Math.floor(Date.now() / 1000) + CLOCK_SKEW_SECONDS) {
    return {
      ok: false,
      error: "invalid_request",
      message: "Assertion iat is too far in the future",
    };
  }

  // aud must be the exact protected-resource URL. An origin-only audience is
  // deliberately not accepted because it would allow an assertion minted for
  // another endpoint on the same host to cross the MCP resource boundary.
  const acceptedAudiences = new Set(
    [expectedResource ?? new URL("/mcp", getSiteUrl()).toString()].filter(
      (value): value is string => Boolean(value),
    ),
  );
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (
    !auds.some(
      (audience) =>
        typeof audience === "string" && acceptedAudiences.has(audience),
    )
  ) {
    return {
      ok: false,
      error: "invalid_audience",
      message: "aud does not match this service",
    };
  }

  if (typeof payload.jti !== "string" || !payload.jti) {
    return { ok: false, error: "invalid_request", message: "Missing jti" };
  }
  if (payload.email_verified !== true) {
    return {
      ok: false,
      error: "missing_verified_email",
      message: "Assertion must carry email_verified: true",
    };
  }
  if (typeof payload.email !== "string" || !payload.email.includes("@")) {
    return {
      ok: false,
      error: "missing_verified_email",
      message: "Assertion must carry a verified email",
    };
  }

  if (typeof payload.auth_time !== "number") {
    return {
      ok: false,
      status: 401,
      error: "login_required",
      message:
        "auth_time is missing; re-authenticate at the provider and mint a fresh ID-JAG",
    };
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.auth_time > nowSeconds + CLOCK_SKEW_SECONDS) {
    return {
      ok: false,
      error: "invalid_request",
      message: "auth_time is too far in the future",
    };
  }
  const ageSeconds = nowSeconds - payload.auth_time;
  if (ageSeconds > ID_JAG_MAX_AUTH_AGE_SECONDS) {
    return {
      ok: false,
      status: 401,
      error: "login_required",
      message: `auth_time is ${ageSeconds}s old; max allowed is ${ID_JAG_MAX_AUTH_AGE_SECONDS}s. Re-authenticate at the provider and request a fresh ID-JAG.`,
    };
  }

  // Consume the one-time jti only after all claim validation has passed. A
  // signed but malformed or stale assertion must not burn a valid provider
  // assertion identifier before the caller can retry with a fresh request.
  const replayed = await recordJtiSeen(
    tenantId,
    payload.jti,
    typeof payload.exp === "number"
      ? payload.exp
      : Math.floor(Date.now() / 1000) + 300,
  );
  if (replayed) {
    return {
      ok: false,
      error: "replay_detected",
      message: "Assertion jti was already used",
    };
  }

  return { ok: true, payload, provider };
}

/** Insert jti into the replay cache; returns true when it was already seen. */
async function recordJtiSeen(
  tenantId: string,
  jti: string,
  expSeconds: number,
): Promise<boolean> {
  const expiresAt = new Date((expSeconds + CLOCK_SKEW_SECONDS) * 1000);
  const inserted = await db()
    .insert(agentJtiSeen)
    .values({ jti: `id-jag:${tenantId}:${jti}`, expiresAt })
    .onConflictDoNothing()
    .returning({ jti: agentJtiSeen.jti });
  return inserted.length === 0;
}
