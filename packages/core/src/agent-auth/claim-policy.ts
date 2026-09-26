import type { AgentClaimAttempt } from "@repo/database/schema-agent-auth";

export const MAX_CODE_ATTEMPTS = 5;

/**
 * A claim attempt is usable only while it is initiated, within its short
 * window, and below the failed-code limit. Keep this policy independent from
 * database and signing modules so it can be tested without runtime services.
 */
export function isClaimAttemptUsable(
  attempt: Pick<AgentClaimAttempt, "status" | "expiresAt" | "failedAttempts">,
  now = new Date(),
): boolean {
  return (
    attempt.status === "initiated" &&
    attempt.expiresAt.getTime() > now.getTime() &&
    attempt.failedAttempts < MAX_CODE_ATTEMPTS
  );
}
