import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, db, eq, isNull, resolveTenantFromHost } from "@repo/database";
import { accountApiToken, user } from "@repo/database/schema";

export const ACCOUNT_TOKEN_PREFIX = "cet_";
export const ACCOUNT_TOKEN_DISPLAY_PREFIX_LEN = 12;

export type TokenExpiration =
  | "1h"
  | "1d"
  | "7d"
  | "30d"
  | "60d"
  | "90d"
  | "180d"
  | "1y"
  | "never";

const EXPIRATION_MS: Record<Exclude<TokenExpiration, "never">, number> = {
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "60d": 60 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
  "180d": 180 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
};

export function expirationToDate(exp: TokenExpiration): Date | null {
  if (exp === "never") return null;
  return new Date(Date.now() + EXPIRATION_MS[exp]);
}

export function isValidExpiration(value: string): value is TokenExpiration {
  return [
    "1h",
    "1d",
    "7d",
    "30d",
    "60d",
    "90d",
    "180d",
    "1y",
    "never",
  ].includes(value);
}

/** Generate a new plaintext token like `cet_<32 url-safe chars>`. */
export function generatePlaintextToken(): string {
  return `${ACCOUNT_TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
}

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function tokenDisplayPrefix(plaintext: string): string {
  return plaintext.slice(0, ACCOUNT_TOKEN_DISPLAY_PREFIX_LEN);
}

/**
 * Verify an incoming request's bearer token. Returns the token identity,
 * tenant, and immutable scope on success. Updates `lastUsedAt`; expired,
 * revoked, archived, or cross-tenant tokens return null.
 */
export async function verifyAccountToken(req: Request): Promise<{
  tokenId: string;
  userId: string;
  tenantId: string;
  scope: string;
} | null> {
  const authz = req.headers.get("authorization") ?? "";
  const match = authz.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const plaintext = match[1].trim();
  if (!plaintext.startsWith(ACCOUNT_TOKEN_PREFIX)) return null;

  const hash = hashToken(plaintext);
  const [row] = await db()
    .select()
    .from(accountApiToken)
    .where(
      and(
        eq(accountApiToken.tokenHash, hash),
        isNull(accountApiToken.revokedAt),
      ),
    )
    .limit(1);

  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

  const tenant = await resolveTenantFromHost(req.headers.get("host"));
  if (!tenant) return null;

  const [userRow] = await db()
    .select({ tenantId: user.tenantId, archivedAt: user.archivedAt })
    .from(user)
    .where(eq(user.id, row.userId))
    .limit(1);
  if (
    !userRow ||
    userRow.archivedAt !== null ||
    userRow.tenantId !== tenant.id ||
    row.tenantId !== tenant.id
  ) {
    return null;
  }

  // Best-effort lastUsedAt update; ignore failures.
  void db()
    .update(accountApiToken)
    .set({ lastUsedAt: new Date() })
    .where(eq(accountApiToken.id, row.id))
    .catch(() => {});

  return {
    tokenId: row.id,
    userId: row.userId,
    tenantId: userRow.tenantId,
    scope: normalizeAccountScope(row.scope),
  };
}

/** Convert the legacy `full` label to the protocol scopes it represents. */
export function normalizeAccountScope(scope: string): string {
  if (scope.trim() === "full") return "api.read api.write";
  return scope
    .split(/\s+/)
    .filter((value) => value === "api.read" || value === "api.write")
    .join(" ");
}
