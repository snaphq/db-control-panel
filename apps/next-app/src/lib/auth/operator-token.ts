import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, db, eq, isNull, resolveTenantFromHost } from "@repo/database";
import { member, organization, user } from "@repo/database/schema";
import { operator, operatorToken } from "@repo/database/schema-operators";

export const OPERATOR_TOKEN_PREFIX = "opt_";
export const OPERATOR_TOKEN_DISPLAY_PREFIX_LEN = 12;

/** Organization roles that may perform write operations with an operator. */
export const OPERATOR_WRITE_ROLES = ["owner", "admin"] as const;

export type OperatorTokenExpiration =
  | "1h"
  | "1d"
  | "7d"
  | "30d"
  | "60d"
  | "90d"
  | "180d"
  | "1y"
  | "never";

const EXPIRATION_MS: Record<
  Exclude<OperatorTokenExpiration, "never">,
  number
> = {
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "60d": 60 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
  "180d": 180 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
};

export function expirationToDate(exp: OperatorTokenExpiration): Date | null {
  if (exp === "never") return null;
  return new Date(Date.now() + EXPIRATION_MS[exp]);
}

export function isValidExpiration(
  value: string,
): value is OperatorTokenExpiration {
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

/** Generate a new plaintext token like `opt_<32 url-safe chars>`. */
export function generateOperatorTokenPlaintext(): string {
  return `${OPERATOR_TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
}

export function hashOperatorToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function operatorTokenDisplayPrefix(plaintext: string): string {
  return plaintext.slice(0, OPERATOR_TOKEN_DISPLAY_PREFIX_LEN);
}

export function isOperatorTokenPlaintext(value: string): boolean {
  return value.startsWith(OPERATOR_TOKEN_PREFIX);
}

/**
 * Operator scope: either every organization the owner currently holds with
 * role `owner`, or an explicit list of organizations the owner belongs to.
 * Roles and membership are always re-checked live at request time.
 */
export type OperatorScope =
  | { mode: "all_owned" }
  | { mode: "organizations"; organizationIds: string[] };

/**
 * Parse a stored/generated scope value. Returns null for malformed input so
 * callers fail closed instead of throwing on corrupt JSON.
 */
export function parseOperatorScope(value: unknown): OperatorScope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.mode === "all_owned") return { mode: "all_owned" };
  if (record.mode !== "organizations") return null;
  if (!Array.isArray(record.organizationIds)) return null;
  const ids: string[] = [];
  for (const candidate of record.organizationIds) {
    if (typeof candidate !== "string") return null;
    const trimmed = candidate.trim();
    if (!trimmed) return null;
    ids.push(trimmed);
  }
  if (ids.length === 0) return null;
  return {
    mode: "organizations",
    organizationIds: Array.from(new Set(ids)),
  };
}

export type OperatorOrganization = {
  id: string;
  slug: string;
  name: string;
  role: string;
};

/** Every organization the user currently belongs to, with their live role. */
export async function listUserOrganizations(
  tenantId: string,
  userId: string,
): Promise<OperatorOrganization[]> {
  return db()
    .select({
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(
      and(
        eq(member.tenantId, tenantId),
        eq(member.userId, userId),
        eq(organization.tenantId, tenantId),
      ),
    );
}

/**
 * Resolve the organizations an operator token can currently reach. Membership,
 * role, organization existence, and scope are all applied against live rows.
 */
export async function resolveOperatorOrganizations(
  tenantId: string,
  userId: string,
  scope: OperatorScope,
): Promise<OperatorOrganization[]> {
  const rows = await listUserOrganizations(tenantId, userId);
  if (scope.mode === "all_owned") {
    return rows.filter((row) => row.role === "owner");
  }
  const ids = new Set(scope.organizationIds);
  return rows.filter((row) => ids.has(row.id));
}

export type VerifiedOperator = {
  credentialId: string;
  operatorId: string;
  operatorName: string;
  userId: string;
  tenantId: string;
  scope: OperatorScope;
  organizations: OperatorOrganization[];
  scopes: string[];
};

function bearerCredentials(req: Request): string | null {
  const authz = req.headers.get("authorization") ?? "";
  const match = authz.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const value = match[1].trim();
  return value.length > 0 ? value : null;
}

/**
 * Detect a retired account token so the MCP route can return an actionable
 * 401 instead of a generic invalid-token response.
 */
export function isLegacyAccountToken(req: Request): boolean {
  const plaintext = bearerCredentials(req);
  return plaintext?.startsWith("cet_") ?? false;
}

/**
 * Verify an incoming request's operator bearer token. Returns the operator
 * identity with live organization reachability on success. Unknown, revoked,
 * expired, suspended, archived-owner, cross-tenant, and corrupt-scope tokens
 * all return null. Updates `lastUsedAt` best-effort.
 */
export async function verifyOperatorToken(
  req: Request,
): Promise<VerifiedOperator | null> {
  const plaintext = bearerCredentials(req);
  if (!plaintext) return null;
  if (!isOperatorTokenPlaintext(plaintext)) return null;

  const [row] = await db()
    .select({
      tokenId: operatorToken.id,
      tokenTenantId: operatorToken.tenantId,
      tokenExpiresAt: operatorToken.expiresAt,
      operatorId: operator.id,
      operatorName: operator.name,
      operatorStatus: operator.status,
      operatorRevokedAt: operator.revokedAt,
      operatorTenantId: operator.tenantId,
      operatorScope: operator.scope,
      userId: operator.userId,
    })
    .from(operatorToken)
    .innerJoin(operator, eq(operatorToken.operatorId, operator.id))
    .where(
      and(
        eq(operatorToken.tokenHash, hashOperatorToken(plaintext)),
        isNull(operatorToken.revokedAt),
      ),
    )
    .limit(1);

  if (!row) return null;
  if (row.tokenExpiresAt && row.tokenExpiresAt.getTime() <= Date.now()) {
    return null;
  }
  if (row.operatorStatus !== "active" || row.operatorRevokedAt !== null) {
    return null;
  }

  const tenant = await resolveTenantFromHost(req.headers.get("host"));
  if (!tenant) return null;
  if (row.tokenTenantId !== tenant.id || row.operatorTenantId !== tenant.id) {
    return null;
  }

  const scope = parseOperatorScope(row.operatorScope);
  if (!scope) return null;

  const [owner] = await db()
    .select({ tenantId: user.tenantId, archivedAt: user.archivedAt })
    .from(user)
    .where(eq(user.id, row.userId))
    .limit(1);
  if (!owner || owner.archivedAt !== null || owner.tenantId !== tenant.id) {
    return null;
  }

  const organizations = await resolveOperatorOrganizations(
    tenant.id,
    row.userId,
    scope,
  );
  const scopes = ["api.read"];
  if (
    organizations.some((org) =>
      (OPERATOR_WRITE_ROLES as readonly string[]).includes(org.role),
    )
  ) {
    scopes.push("api.write");
  }

  // Best-effort lastUsedAt update; ignore failures.
  void db()
    .update(operatorToken)
    .set({ lastUsedAt: new Date() })
    .where(eq(operatorToken.id, row.tokenId))
    .catch(() => {});

  return {
    credentialId: row.tokenId,
    operatorId: row.operatorId,
    operatorName: row.operatorName,
    userId: row.userId,
    tenantId: tenant.id,
    scope,
    organizations,
    scopes,
  };
}
