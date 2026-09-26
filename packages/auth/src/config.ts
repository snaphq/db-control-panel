/**
 * @repo/auth/config - Auth configuration
 *
 * Since this project uses Better Auth exclusively,
 * provider name always returns "better-auth".
 */

export function getProviderName(): string {
  return "better-auth";
}

export function getAuthConfig(provider?: string) {
  const baseURL =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3000");
  const configuredSecret = process.env.BETTER_AUTH_SECRET?.trim();
  const production =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production";
  if (production && !configuredSecret) {
    throw new Error(
      "BETTER_AUTH_SECRET is required in production; refusing to use a development secret",
    );
  }
  const secret = configuredSecret ?? "development-secret-change-me";

  return { baseURL, secret };
}
