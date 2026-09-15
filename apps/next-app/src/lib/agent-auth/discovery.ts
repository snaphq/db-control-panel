import "server-only";

import { absoluteUrl, getSiteUrl } from "@/lib/site-config";

export const GRANT_JWT_BEARER = "urn:ietf:params:oauth:grant-type:jwt-bearer";
export const GRANT_CLAIM = "urn:workos:agent-auth:grant-type:claim";
export const ASSERTION_TYPE_ID_JAG = "urn:ietf:params:oauth:token-type:id-jag";
export const REVOKED_EVENT_SCHEMA =
  "https://schemas.workos.com/events/agent/auth/identity/assertion/revoked";

/** Scopes the resource server understands (PRM + AS metadata). */
export const AGENT_SCOPES_SUPPORTED = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "api.read",
  "api.write",
];

/** The `agent_auth` profile extension block for the AS metadata document. */
export function buildAgentAuthBlock(origin = getSiteUrl()) {
  const url = (pathname: string) => new URL(pathname, origin).toString();
  return {
    skill: url("/auth.md"),
    identity_endpoint: url("/agent/identity"),
    claim_endpoint: url("/agent/identity/claim"),
    events_endpoint: url("/agent/event/notify"),
    // Agent-specific token surface: only the two agent grants; standard OAuth
    // clients keep using the interactive token_endpoint at the top level.
    token_endpoint: url("/oauth2/token"),
    revocation_endpoint: url("/oauth2/revoke"),
    identity_types_supported: [
      "anonymous",
      "identity_assertion",
      "service_auth",
    ],
    identity_assertion: {
      assertion_types_supported: [ASSERTION_TYPE_ID_JAG],
    },
    events_supported: [REVOKED_EVENT_SCHEMA],
  };
}

/** WWW-Authenticate challenge emitted on 401s from protected resources. */
export function bearerChallenge(request?: Request): string {
  const origin = request ? requestOriginForRequest(request) : getSiteUrl();
  return `Bearer resource_metadata="${new URL(
    "/.well-known/oauth-protected-resource",
    origin,
  ).toString()}"`;
}

/**
 * Return the origin that handled a request. Host headers are accepted only as
 * a single syntactically valid authority; forwarded headers are deliberately
 * ignored because an untrusted caller can otherwise rewrite a token audience
 * or WWW-Authenticate metadata. A trusted reverse proxy should preserve the
 * public host in `Host` and the public scheme in the request URL.
 */
function canonicalHost(
  candidate: string | null,
  protocol: "http:" | "https:",
): string | null {
  const value = candidate?.trim();
  if (!value || /[,\s\\/@?#]/.test(value)) return null;

  // Host names are case-insensitive and an absolute DNS name may carry one
  // trailing dot. Normalize that spelling before comparing the Host header to
  // the URL parser's representation; otherwise `tenant.example.` can produce
  // a different OAuth issuer/resource from `tenant.example`.
  const normalizeAuthority = (authority: string): string | null => {
    const lower = authority.toLowerCase();
    const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(lower);
    if (bracketed) {
      return `[${bracketed[1]}]${bracketed[2] ? `:${bracketed[2]}` : ""}`;
    }
    const portSeparator = lower.lastIndexOf(":");
    const hasPort =
      portSeparator > 0 && /^\d+$/.test(lower.slice(portSeparator + 1));
    const hostname = hasPort ? lower.slice(0, portSeparator) : lower;
    const port = hasPort ? lower.slice(portSeparator + 1) : "";
    if (!hostname || hostname.endsWith("..")) return null;
    const normalizedHostname = hostname.replace(/\.$/, "");
    if (!normalizedHostname) return null;
    return `${normalizedHostname}${port ? `:${port}` : ""}`;
  };

  try {
    // Parse with the request scheme so an explicit default port (443 for
    // HTTPS, 80 for HTTP) is normalized exactly as URL.origin would do.
    const parsed = new URL(`${protocol}//${value}`);
    const normalizedValue = normalizeAuthority(value);
    const parsedHost = normalizeAuthority(parsed.host);
    if (!normalizedValue || !parsedHost) return null;
    const defaultPort =
      parsed.port === "" &&
      ((protocol === "https:" && normalizedValue.endsWith(":443")) ||
        (protocol === "http:" && normalizedValue.endsWith(":80")));
    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      (parsedHost !== normalizedValue && !defaultPort)
    ) {
      return null;
    }
    return parsedHost;
  } catch {
    return null;
  }
}

export function requestOriginForRequest(request: Request): string {
  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return getSiteUrl();
  }

  const protocol = requestUrl.protocol;
  if (protocol !== "http:" && protocol !== "https:") return getSiteUrl();

  const host =
    canonicalHost(request.headers.get("host"), protocol) ??
    canonicalHost(requestUrl.host, protocol);
  if (host) return `${protocol}//${host}`;
  const requestUrlHost = canonicalHost(requestUrl.host, protocol);
  return requestUrlHost ? `${protocol}//${requestUrlHost}` : requestUrl.origin;
}

export function resourceUrlForRequest(request: Request): string {
  return new URL("/mcp", requestOriginForRequest(request)).toString();
}

/** Exact delivery URL advertised for Security Event Token notifications. */
export function eventNotificationUrlForRequest(request: Request): string {
  return new URL(
    "/agent/event/notify",
    requestOriginForRequest(request),
  ).toString();
}
