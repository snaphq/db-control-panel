/** Build the sign-in URL used by an agent claim verification ceremony. */
export function verificationUriFor(
  attemptToken: string,
  origin: string,
): string {
  const claimPath = `/claim?claim_attempt_token=${encodeURIComponent(attemptToken)}`;
  return new URL(
    `/auth/sign-in?redirect=${encodeURIComponent(claimPath)}`,
    origin,
  ).toString();
}
