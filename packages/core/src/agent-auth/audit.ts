import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@repo/database";
import { agentAuthAudit } from "@repo/database/schema-agent-auth";

export type AgentAuthAuditEvent =
  | "registration.created"
  | "assertion.issued"
  | "token.issued"
  | "token.revoked"
  | "claim.requested"
  | "user_code.minted"
  | "claim.confirmed"
  | "registration.expired"
  | "registration.revoked";

/** Fire-and-forget audit writer; failures must never break the flow. */
export async function recordAudit(params: {
  tenantId: string;
  event: AgentAuthAuditEvent;
  registrationId?: string | null;
  email?: string | null;
  issuer?: string | null;
  subject?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  try {
    await db()
      .insert(agentAuthAudit)
      .values({
        id: `aaudit_${randomUUID()}`,
        tenantId: params.tenantId,
        registrationId: params.registrationId ?? null,
        event: params.event,
        email: params.email ?? null,
        issuer: params.issuer ?? null,
        subject: params.subject ?? null,
        metadata: params.metadata ?? null,
        ip: params.ip ?? null,
      });
  } catch (err) {
    console.error("[agent-auth] audit write failed", err);
  }
}
