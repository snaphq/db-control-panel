import { createHash } from "node:crypto";

/**
 * Pure OAuth policy checks shared by the route adapter and regression tests.
 * Keep protocol validation independent from Better Auth and database access so
 * it can be exercised without a configured runtime.
 */

export type OAuthPolicyError = {
  error: string;
  description: string;
};

export type BasicClientCredentials = {
  clientId: string;
  clientSecret: string;
};

/**
 * Parse RFC 6749 HTTP Basic client authentication. The auth-scheme is
 * case-insensitive, and the credentials are application/x-www-form-urlencoded
 * values before their base64 encoding. Return null for both an absent and a
 * malformed header so callers can fail closed without exposing parser detail.
 */
export function parseBasicAuthorization(
  value: string | null | undefined,
): BasicClientCredentials | null {
  const match = value?.trim().match(/^Basic\s+(\S+)$/i);
  if (!match) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return null;
  }
  const separator = decoded.indexOf(":");
  if (separator <= 0) return null;

  const decodeComponent = (component: string): string | null => {
    try {
      return decodeURIComponent(component.replace(/\+/g, " "));
    } catch {
      return null;
    }
  };
  const clientId = decodeComponent(decoded.slice(0, separator));
  const clientSecret = decodeComponent(decoded.slice(separator + 1));
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Verify an RFC 7636 S256 code verifier against a stored challenge. */
export function matchesS256CodeChallenge(
  verifier: string,
  challenge: string,
): boolean {
  if (!verifier || !challenge) return false;
  const digest = createHash("sha256").update(verifier).digest("base64url");
  return digest === challenge;
}

export function isSafeRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return false;
  }
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return false;
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        (url.hostname === "localhost" ||
          url.hostname === "127.0.0.1" ||
          url.hostname === "[::1]" ||
          url.hostname === "::1"))
    );
  } catch {
    return false;
  }
}

function safeArray(value: unknown, fallback: string[]): string[] | null {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return null;
  }
  return value as string[];
}

/** Validate the metadata accepted by the dynamic MCP client registration. */
export function validateDynamicRegistration(
  body: Record<string, unknown>,
): OAuthPolicyError | null {
  const grantTypes = safeArray(body.grant_types, ["authorization_code"]);
  const responseTypes = safeArray(body.response_types, ["code"]);
  const redirectUris = safeArray(body.redirect_uris, []);
  if (
    !grantTypes ||
    grantTypes.length !== 1 ||
    grantTypes[0] !== "authorization_code"
  ) {
    return {
      error: "invalid_client_metadata",
      description:
        "Only the authorization_code grant is supported for MCP clients",
    };
  }
  if (
    !responseTypes ||
    responseTypes.length !== 1 ||
    responseTypes[0] !== "code"
  ) {
    return {
      error: "invalid_client_metadata",
      description: "Only the code response type is supported for MCP clients",
    };
  }
  if (
    !redirectUris ||
    redirectUris.length === 0 ||
    redirectUris.some((redirectUri) => !isSafeRedirectUri(redirectUri))
  ) {
    return {
      error: "invalid_redirect_uri",
      description:
        "Redirect URIs must be absolute HTTPS URLs (or loopback HTTP URLs)",
    };
  }
  const authMethod = body.token_endpoint_auth_method ?? "client_secret_basic";
  if (
    authMethod !== "client_secret_basic" &&
    authMethod !== "client_secret_post"
  ) {
    return {
      error: "invalid_client_metadata",
      description:
        "MCP clients must use client_secret_basic or client_secret_post",
    };
  }
  return null;
}

/** Extract a non-empty exact protected-resource binding from stored metadata. */
export function boundResourceFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as { resource?: unknown }).resource;
  return typeof value === "string" && value.length > 0 ? value : null;
}
