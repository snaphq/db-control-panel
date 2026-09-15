import "server-only";

import { randomBytes } from "node:crypto";
import { db } from "@repo/database";
import {
  type AgentRegistration,
  agentRegistration,
} from "@repo/database/schema-agent-auth";
import { and, eq, lt } from "drizzle-orm";
import { sha256Hex } from "./keys";
import { isRegistrationUsable, resolveScopes } from "./registration-policy";

export { isRegistrationUsable, resolveScopes } from "./registration-policy";

export const CLAIM_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // outer claim window
export const USER_CODE_TTL_MS = 10 * 60 * 1000; // user_code window
export const REGISTRATION_TTL_DAYS = Number(
  process.env.AGENT_AUTH_REGISTRATION_TTL_DAYS ?? 30,
);

export const PRE_CLAIM_SCOPES = "api.read";
export const POST_CLAIM_SCOPES = "api.read api.write";

export type RegistrationType =
  | "anonymous"
  | "service_auth"
  | "identity_assertion";

export function newRegistrationId(): string {
  return `reg_${randomBytes(12).toString("base64url")}`;
}

/** High-entropy claim_token; plaintext returned to the agent exactly once. */
export function newClaimToken(): {
  plaintext: string;
  hash: string;
  expiresAt: Date;
} {
  const plaintext = `clm_${randomBytes(25).toString("base64url")}`;
  return {
    plaintext,
    hash: sha256Hex(plaintext),
    expiresAt: new Date(Date.now() + CLAIM_TOKEN_TTL_MS),
  };
}

/** CSPRNG 6-digit user_code per RFC 8628 §6.1 guidance. */
export function newUserCode(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return String(n).padStart(6, "0");
}

/** Lazily flip unclaimed registrations past their TTL or claim window to expired. */
export async function expireStaleRegistrations(
  tenantId?: string,
): Promise<void> {
  const now = new Date();
  const tenantScope = tenantId
    ? eq(agentRegistration.tenantId, tenantId)
    : null;
  await db()
    .update(agentRegistration)
    .set({ status: "expired" })
    .where(
      and(
        eq(agentRegistration.status, "unclaimed"),
        lt(agentRegistration.registrationExpiresAt, now),
        ...(tenantScope ? [tenantScope] : []),
      ),
    );
  await db()
    .update(agentRegistration)
    .set({ status: "expired" })
    .where(
      and(
        eq(agentRegistration.status, "unclaimed"),
        lt(agentRegistration.claimExpiresAt, now),
        ...(tenantScope ? [tenantScope] : []),
      ),
    );
}

export async function getRegistration(
  id: string,
  tenantId?: string,
): Promise<AgentRegistration | null> {
  const tenantScope = tenantId
    ? eq(agentRegistration.tenantId, tenantId)
    : null;
  const [row] = await db()
    .select()
    .from(agentRegistration)
    .where(
      and(eq(agentRegistration.id, id), ...(tenantScope ? [tenantScope] : [])),
    )
    .limit(1);
  return row ?? null;
}

export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}
