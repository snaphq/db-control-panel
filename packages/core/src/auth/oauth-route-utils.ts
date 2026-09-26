import { auth } from "@repo/auth/server";
import { SignJWT, decodeJwt } from "jose";
import { NextResponse } from "next/server";
import { getSigningKey } from "../agent-auth/keys";

export function oauthError(
  error: string,
  description: string,
  status = 400,
  extraHeaders?: HeadersInit,
) {
  return NextResponse.json(
    { error, error_description: description },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        ...extraHeaders,
      },
    },
  );
}

export function invalidUserInfoToken(description: string): Response {
  return oauthError("invalid_token", description, 401, {
    "WWW-Authenticate": 'Bearer error="invalid_token"',
  });
}

export function hasSessionCookie(request: Request): boolean {
  // Better Auth uses `better-auth.session_token` (or its secure-cookie
  // variant). Keep this deliberately broad so a stale cookie cannot be
  // mistaken for an anonymous authorization request on another tenant host.
  return /(?:^|;\s*)(?:__Secure-|__Host-)?better-auth\.session_token=/.test(
    request.headers.get("cookie") ?? "",
  );
}

export async function validateTenantSession(
  request: Request,
  required: boolean,
): Promise<Response | null> {
  const session = await auth.api.getSession({
    headers: new Headers(request.headers),
  });
  if (session?.user?.id) return null;
  if (required || hasSessionCookie(request)) {
    return oauthError(
      "login_required",
      "Sign in with an active account on this tenant before continuing",
      401,
    );
  }
  return null;
}

export function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function parseVerificationValue(
  value: string,
): Record<string, unknown> | null {
  const parsed = parseJsonObject(value);
  return parsed;
}

export function oauthAudience(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (
    Array.isArray(value) &&
    value.length === 1 &&
    typeof value[0] === "string"
  ) {
    return value[0];
  }
  return null;
}

export function oauthRedirectResponse(
  url: string,
  signOutResponse?: Response,
): Response {
  const headers = new Headers({
    Location: url,
    "Cache-Control": "no-store",
  });
  const setCookie = signOutResponse?.headers.get("set-cookie");
  if (setCookie) headers.set("set-cookie", setCookie);
  return new Response(null, { status: 303, headers });
}

export async function parseEndSessionQuery(
  request: Request,
): Promise<URLSearchParams> {
  const query = new URL(request.url).searchParams;
  if (request.method !== "POST") return query;

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const raw = await request.clone().text();
  if (!raw) return query;
  let body: URLSearchParams;
  if (contentType.includes("application/json")) {
    const parsed = parseJsonObject(raw);
    if (!parsed) throw new Error("End-session body must be a JSON object");
    body = new URLSearchParams();
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" || typeof value === "number") {
        body.set(key, String(value));
      }
    }
  } else {
    body = new URLSearchParams(raw);
  }
  for (const [key, value] of body) {
    if (!query.has(key)) query.set(key, value);
  }
  return query;
}

/**
 * Re-sign Better Auth's symmetric ID token with the service signing key.
 * The public key is already published at /.well-known/jwks.json for the
 * agent-auth tokens; using the same key keeps OIDC discovery and the actual
 * ID-token verification surface consistent without exposing an HMAC secret.
 */
export async function resignOidcIdToken(
  token: string,
  issuer: string,
): Promise<string> {
  const decoded = decodeJwt(token);
  if (!decoded.sub || !decoded.aud || typeof decoded.exp !== "number") {
    throw new Error("OIDC ID token is missing required claims");
  }

  const {
    iss: _iss,
    aud: _aud,
    sub: _sub,
    iat: _iat,
    exp: _exp,
    nbf: _nbf,
    jti: _jti,
    ...claims
  } = decoded;
  const { privateKey, kid } = await getSigningKey();
  const signed = new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", typ: "JWT", kid })
    .setIssuer(issuer)
    .setAudience(decoded.aud)
    .setSubject(decoded.sub)
    .setExpirationTime(decoded.exp);
  if (typeof decoded.iat === "number") signed.setIssuedAt(decoded.iat);
  if (typeof decoded.nbf === "number") signed.setNotBefore(decoded.nbf);
  if (typeof decoded.jti === "string") signed.setJti(decoded.jti);
  return signed.sign(privateKey);
}

export async function parseOAuthForm(
  request: Request,
): Promise<URLSearchParams> {
  const raw = await request.clone().text();
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    const parsed = parseJsonObject(raw);
    if (!parsed) throw new Error("OAuth body must be a JSON object");
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" || typeof value === "number") {
        form.set(key, String(value));
      } else if (typeof value === "boolean") {
        form.set(key, value ? "true" : "false");
      }
    }
    return form;
  }
  return new URLSearchParams(raw);
}

export function responseWithJson(
  response: Response,
  body: Record<string, unknown>,
): Response {
  const headers = new Headers(response.headers);
  // The body is re-serialized with an added resource claim; preserve neither
  // a stale byte count nor an upstream content encoding for the new payload.
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function normalizeBasicAuthorizationRequest(request: Request): Request {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.trim().match(/^Basic\s+(\S+)$/i);
  if (!match || authorization.startsWith("Basic ")) return request;
  const headers = new Headers(request.headers);
  headers.set("authorization", `Basic ${match[1]}`);
  return new Request(request, { headers });
}
