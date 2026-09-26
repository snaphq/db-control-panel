/**
 * Extract the Better Auth session token from the signed session cookie.
 *
 * The database value is the signed cookie's payload before the final
 * signature segment. Callers must still authenticate the session and scope
 * any database lookup by user and tenant; this helper only avoids selecting
 * `session.token` into a result set.
 */
export function sessionTokenFromCookieHeader(
  cookieHeader: string | null,
): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    if (
      name !== "better-auth.session_token" &&
      name !== "__Secure-better-auth.session_token" &&
      name !== "__Host-better-auth.session_token"
    ) {
      continue;
    }

    let value = part.slice(separator + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      return null;
    }
    const signatureSeparator = value.lastIndexOf(".");
    if (signatureSeparator <= 0) return null;
    return value.slice(0, signatureSeparator);
  }

  return null;
}
