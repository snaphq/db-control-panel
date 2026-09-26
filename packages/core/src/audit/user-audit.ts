import { randomUUID } from "node:crypto";
import { db } from "@repo/database";
import { userAuditLogs } from "@repo/database/schema";

export type UserAuditAction =
  | "session.revoked"
  | "session.revoked_others"
  | "two_factor.enabled"
  | "two_factor.disabled"
  | "passkey.added"
  | "passkey.deleted";

interface RecordUserAuditEvent {
  userId: string;
  action: UserAuditAction;
  metadata?: Record<string, unknown>;
  headers?: Headers;
}

/**
 * Append a row to user_audit_logs. Best-effort: failures are swallowed and logged
 * so they never break the user-facing action.
 */
export async function recordUserAudit({
  userId,
  action,
  metadata,
  headers,
}: RecordUserAuditEvent): Promise<void> {
  try {
    const ipAddress =
      headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headers?.get("x-real-ip") ||
      null;
    const userAgent = headers?.get("user-agent") ?? null;

    await db()
      .insert(userAuditLogs)
      .values({
        id: randomUUID(),
        userId,
        action,
        metadata: metadata ? JSON.stringify(metadata) : null,
        ipAddress,
        userAgent,
      });
  } catch (err) {
    console.error("recordUserAudit failed", { action, userId, err });
  }
}
