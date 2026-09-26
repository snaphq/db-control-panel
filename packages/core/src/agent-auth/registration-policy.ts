import type { AgentRegistration } from "@repo/database/schema-agent-auth";

/** Resolve the scope set a token exchange should grant for this registration. */
export function resolveScopes(registration: AgentRegistration): string {
  if (
    registration.type === "anonymous" &&
    registration.status === "unclaimed"
  ) {
    return registration.preClaimScopes;
  }
  return registration.scopes;
}

/**
 * Return whether a registration can still mint or exchange credentials.
 * Registration expiry is independent from the short user-code window, while
 * an unclaimed row is also bounded by its outer claim window.
 */
export function isRegistrationUsable(
  registration: Pick<
    AgentRegistration,
    "status" | "registrationExpiresAt" | "claimExpiresAt" | "userId"
  >,
  now = new Date(),
): boolean {
  if (
    registration.status !== "unclaimed" &&
    registration.status !== "claimed"
  ) {
    return false;
  }
  if (
    registration.registrationExpiresAt &&
    registration.registrationExpiresAt.getTime() <= now.getTime()
  ) {
    return false;
  }
  if (
    registration.status === "unclaimed" &&
    registration.claimExpiresAt &&
    registration.claimExpiresAt.getTime() <= now.getTime()
  ) {
    return false;
  }
  if (registration.status === "claimed" && !registration.userId) return false;
  return true;
}
