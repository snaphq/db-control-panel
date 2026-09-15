import "server-only";

import { isIP } from "node:net";
import {
  createSafeMcpDispatcher,
  isPrivateAddress,
  limitResponseBody,
} from "@/lib/integrations/mcp-proxy";
import { db } from "@repo/database";
import { agentProvider } from "@repo/database/schema-agent-auth";
import type { AgentProvider } from "@repo/database/schema-agent-auth";
import { and, eq } from "drizzle-orm";
import { type JWTVerifyGetKey, createRemoteJWKSet, customFetch } from "jose";

export type TrustedProvider = AgentProvider;

/** Look up a trusted provider by issuer within a tenant's trust list. */
export async function findTrustedProvider(
  tenantId: string,
  issuer: string,
): Promise<TrustedProvider | null> {
  const [row] = await db()
    .select()
    .from(agentProvider)
    .where(
      and(
        eq(agentProvider.tenantId, tenantId),
        eq(agentProvider.issuer, issuer),
        eq(agentProvider.status, "active"),
      ),
    )
    .limit(1);
  if (!row) return null;
  try {
    validateIssuer(row.issuer);
  } catch {
    // Treat malformed trust-list data as disabled. An administrator must fix
    // the row before it can be used to verify a provider assertion.
    return null;
  }
  return row;
}

function validateIssuer(issuer: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(issuer);
  } catch {
    throw new Error("Trusted provider issuer is invalid");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Trusted provider issuer must use HTTPS");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      "Trusted provider issuer cannot contain credentials, queries, or fragments",
    );
  }
  if (!parsed.hostname) {
    throw new Error("Trusted provider issuer must include a hostname");
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname) && isPrivateAddress(hostname)) {
    throw new Error("Trusted provider issuer cannot target a private address");
  }
  return parsed;
}

export function jwksUriFor(provider: TrustedProvider): string {
  const base = provider.issuer.replace(/\/$/, "");
  return provider.jwksUri ?? `${base}/.well-known/jwks.json`;
}

function validateJwksUri(uri: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error("Trusted provider JWKS URI is invalid");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Trusted provider JWKS URI must use HTTPS");
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error("Trusted provider JWKS URI cannot contain credentials");
  }
  if (parsed.search) {
    throw new Error("Trusted provider JWKS URI cannot contain a query string");
  }
  if (!parsed.hostname) {
    throw new Error("Trusted provider JWKS URI must include a hostname");
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname) && isPrivateAddress(hostname)) {
    throw new Error(
      "Trusted provider JWKS URI cannot target a private address",
    );
  }
  return parsed;
}

type CacheEntry = {
  remoteJwks: ReturnType<typeof createRemoteJWKSet>;
  fetchedAt: number;
};

const jwksCache = new Map<string, CacheEntry>();
const FLOOR_MS = 10 * 60 * 1000; // refetch at least every 10 minutes
const CEILING_MS = 24 * 60 * 60 * 1000;
// The resolver may fetch repeatedly over the process lifetime. Reuse one
// dispatcher so a per-fetch Agent does not leak sockets when jose consumes the
// response body after the custom fetch callback returns.
const providerDispatcher = createSafeMcpDispatcher();

/**
 * Create a jose key resolver for a provider's JWKS. Cached for a clamped
 * 10min–24h window and refetched once on failure (cooldown-limited) so
 * provider key rotation works without restarts.
 */
export function getProviderKeyResolver(
  provider: TrustedProvider,
): JWTVerifyGetKey {
  validateIssuer(provider.issuer);
  const uri = jwksUriFor(provider);
  const parsedUri = validateJwksUri(uri);

  function buildRemote() {
    const remote = createRemoteJWKSet(parsedUri, {
      // Keep jose's own cache aligned with the explicit ceiling/floor policy.
      cacheMaxAge: CEILING_MS,
      cooldownDuration: FLOOR_MS,
      [customFetch]: async (url, options) => {
        const response = await fetch(url, {
          ...options,
          redirect: "error",
          // Use the same socket-time DNS policy as custom MCP egress. The
          // provider trust list is explicit, so no host allowlist is needed
          // here; private/reserved addresses are still rejected.
          dispatcher: providerDispatcher,
        } as RequestInit & {
          dispatcher: ReturnType<typeof createSafeMcpDispatcher>;
        });
        return limitResponseBody(response, 1_000_000);
      },
    });
    jwksCache.set(uri, {
      remoteJwks: remote,
      fetchedAt: Date.now(),
    });
    return remote;
  }

  const existing = jwksCache.get(uri);
  let remote =
    existing && Date.now() - existing.fetchedAt < CEILING_MS
      ? existing.remoteJwks
      : buildRemote();

  return async (protectedHeader, token) => {
    const entry = jwksCache.get(uri);
    if (!entry || Date.now() - entry.fetchedAt >= CEILING_MS) {
      remote = buildRemote();
    }

    try {
      return await remote(protectedHeader, token);
    } catch (err) {
      // Refetch once per cool-down window on failure (handles kid rotation).
      const cached = jwksCache.get(uri);
      if (!cached || Date.now() - cached.fetchedAt >= FLOOR_MS) {
        remote = buildRemote();
        const fresh = jwksCache.get(uri);
        if (fresh) {
          return await fresh.remoteJwks(protectedHeader, token);
        }
      }
      throw err;
    }
  };
}

/** Fetch helper used by discovery of provider display names etc. (reserved). */
export async function listTrustedProviders(
  tenantId: string,
): Promise<TrustedProvider[]> {
  return db()
    .select()
    .from(agentProvider)
    .where(eq(agentProvider.tenantId, tenantId));
}
