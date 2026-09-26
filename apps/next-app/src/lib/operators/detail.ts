import "server-only";

import type {
  OperatorActivityView,
  OperatorDetailView,
  OperatorTokenView,
} from "@/components/account/operators/types";
import {
  type OperatorScope,
  parseOperatorScope,
} from "@/lib/auth/operator-token";
import {
  MAX_OPERATOR_TOKEN_LABEL,
  type OperatorSummary,
  type OperatorTokenSummary,
} from "@/lib/operators/management";
import { and, db, desc, eq, isNull } from "@repo/database";
import {
  operator,
  operatorActivity,
  operatorToken,
} from "@repo/database/schema-operators";

/**
 * Operator detail payload. Same shape as `OperatorSummary`, but `tokens`
 * includes revoked keys (history) ordered active first, then revoked, newest
 * `createdAt` first within each group.
 */
export type OperatorDetail = OperatorSummary;

export type OperatorActivityEntry = {
  id: string;
  credentialId: string | null;
  eventType: string;
  toolName: string | null;
  method: string | null;
  statusCode: number | null;
  durationMs: number | null;
  success: boolean | null;
  error: string | null;
  createdAt: Date;
};

export const DEFAULT_OPERATOR_ACTIVITY_LIMIT = 50;
export const MAX_OPERATOR_ACTIVITY_LIMIT = 200;

type OwnershipArgs = { userId: string; tenantId: string; operatorId: string };

const tokenColumns = {
  id: operatorToken.id,
  label: operatorToken.label,
  tokenPrefix: operatorToken.tokenPrefix,
  expiresAt: operatorToken.expiresAt,
  lastUsedAt: operatorToken.lastUsedAt,
  createdAt: operatorToken.createdAt,
  revokedAt: operatorToken.revokedAt,
};

/** Clamp a requested activity page size to 1..200 (default 50). */
export function clampActivityLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_OPERATOR_ACTIVITY_LIMIT;
  }
  return Math.min(MAX_OPERATOR_ACTIVITY_LIMIT, Math.max(1, Math.trunc(limit)));
}

export type NormalizedTokenLabel =
  | { ok: true; label: string | null }
  | { ok: false; error: "label_too_long" };

/** Trim a token label; empty becomes null; enforce the max length. */
export function normalizeOperatorTokenLabel(
  label: string | null,
): NormalizedTokenLabel {
  const trimmed = label?.trim() ?? "";
  if (trimmed.length > MAX_OPERATOR_TOKEN_LABEL) {
    return { ok: false, error: "label_too_long" };
  }
  return { ok: true, label: trimmed.length > 0 ? trimmed : null };
}

/** Active tokens first, then revoked; newest `createdAt` first in each group. */
export function sortOperatorTokensForDetail<
  T extends { createdAt: Date; revokedAt: Date | null },
>(tokens: T[]): T[] {
  return [...tokens].sort((a, b) => {
    const aRevoked = a.revokedAt ? 1 : 0;
    const bRevoked = b.revokedAt ? 1 : 0;
    if (aRevoked !== bRevoked) return aRevoked - bRevoked;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

async function findOwnedOperatorRow(args: OwnershipArgs) {
  const [row] = await db()
    .select({
      id: operator.id,
      name: operator.name,
      description: operator.description,
      status: operator.status,
      scope: operator.scope,
      createdAt: operator.createdAt,
      updatedAt: operator.updatedAt,
    })
    .from(operator)
    .where(
      and(
        eq(operator.id, args.operatorId),
        eq(operator.userId, args.userId),
        eq(operator.tenantId, args.tenantId),
        isNull(operator.revokedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Owned, non-revoked operator with all of its tokens (active and revoked).
 * Returns null when the operator is missing, not owned, or revoked.
 */
export async function getOwnedOperatorDetail(
  args: OwnershipArgs,
): Promise<OperatorDetail | null> {
  const row = await findOwnedOperatorRow(args);
  if (!row) return null;

  const tokens: OperatorTokenSummary[] = await db()
    .select(tokenColumns)
    .from(operatorToken)
    .where(
      and(
        eq(operatorToken.operatorId, row.id),
        eq(operatorToken.tenantId, args.tenantId),
      ),
    )
    .orderBy(desc(operatorToken.createdAt));

  return {
    ...row,
    scope: row.scope as OperatorScope | null,
    tokens: sortOperatorTokensForDetail(tokens),
  };
}

/**
 * Recent `operator_activity` rows for an owned operator, newest first.
 * Returns [] when the operator is not owned (or revoked).
 */
export async function listOperatorActivity(
  args: OwnershipArgs & { credentialId?: string; limit?: number },
): Promise<OperatorActivityEntry[]> {
  const owned = await findOwnedOperatorRow(args);
  if (!owned) return [];

  const filters = [
    eq(operatorActivity.operatorId, owned.id),
    eq(operatorActivity.tenantId, args.tenantId),
  ];
  if (args.credentialId) {
    filters.push(eq(operatorActivity.credentialId, args.credentialId));
  }

  return db()
    .select({
      id: operatorActivity.id,
      credentialId: operatorActivity.credentialId,
      eventType: operatorActivity.eventType,
      toolName: operatorActivity.toolName,
      method: operatorActivity.method,
      statusCode: operatorActivity.statusCode,
      durationMs: operatorActivity.durationMs,
      success: operatorActivity.success,
      error: operatorActivity.error,
      createdAt: operatorActivity.createdAt,
    })
    .from(operatorActivity)
    .where(and(...filters))
    .orderBy(desc(operatorActivity.createdAt))
    .limit(clampActivityLimit(args.limit));
}

export type UpdateTokenLabelResult =
  | { ok: true; token: OperatorTokenSummary }
  | {
      ok: false;
      error: "token_not_found" | "token_revoked" | "label_too_long";
      status: 400 | 404 | 409;
    };

/**
 * Rename one token of an owned operator. Labels are trimmed and an empty
 * label clears it. Revoked tokens are immutable history.
 */
export async function updateOwnedOperatorTokenLabel(
  args: OwnershipArgs & { tokenId: string; label: string | null },
): Promise<UpdateTokenLabelResult> {
  const normalized = normalizeOperatorTokenLabel(args.label);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error, status: 400 };
  }

  const owned = await findOwnedOperatorRow(args);
  if (!owned) return { ok: false, error: "token_not_found", status: 404 };

  const tokenMatch = and(
    eq(operatorToken.id, args.tokenId),
    eq(operatorToken.operatorId, owned.id),
    eq(operatorToken.tenantId, args.tenantId),
  );

  const [existing] = await db()
    .select({ id: operatorToken.id, revokedAt: operatorToken.revokedAt })
    .from(operatorToken)
    .where(tokenMatch)
    .limit(1);
  if (!existing) return { ok: false, error: "token_not_found", status: 404 };
  if (existing.revokedAt) {
    return { ok: false, error: "token_revoked", status: 409 };
  }

  const [updated] = await db()
    .update(operatorToken)
    .set({ label: normalized.label })
    .where(and(tokenMatch, isNull(operatorToken.revokedAt)))
    .returning(tokenColumns);
  // Revoked between the read and the write.
  if (!updated) return { ok: false, error: "token_revoked", status: 409 };
  return { ok: true, token: updated };
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function serializeOperatorToken(
  token: OperatorTokenSummary,
): OperatorTokenView {
  return {
    id: token.id,
    label: token.label,
    tokenPrefix: token.tokenPrefix,
    expiresAt: toIso(token.expiresAt),
    lastUsedAt: toIso(token.lastUsedAt),
    createdAt: token.createdAt.toISOString(),
    revokedAt: toIso(token.revokedAt),
  };
}

export function serializeOperatorDetail(
  detail: OperatorDetail,
): OperatorDetailView {
  return {
    id: detail.id,
    name: detail.name,
    description: detail.description,
    status: detail.status,
    scope: parseOperatorScope(detail.scope) ?? { mode: "unknown" },
    createdAt: detail.createdAt.toISOString(),
    updatedAt: detail.updatedAt.toISOString(),
    tokens: detail.tokens.map(serializeOperatorToken),
  };
}

export function serializeOperatorActivity(
  entry: OperatorActivityEntry,
): OperatorActivityView {
  return { ...entry, createdAt: entry.createdAt.toISOString() };
}
