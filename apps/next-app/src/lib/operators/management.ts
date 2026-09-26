import "server-only";

import type {
  OperatorScope,
  OperatorTokenExpiration,
} from "@/lib/auth/operator-token";
import {
  expirationToDate,
  generateOperatorTokenPlaintext,
  hashOperatorToken,
  listUserOrganizations,
  operatorTokenDisplayPrefix,
} from "@/lib/auth/operator-token";
import { auth } from "@repo/auth/server";
import {
  and,
  db,
  desc,
  eq,
  inArray,
  isNull,
  resolveTenantFromHost,
  withDbTransaction,
} from "@repo/database";
import { operator, operatorToken } from "@repo/database/schema-operators";
import { nanoid } from "nanoid";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const MAX_OPERATOR_NAME = 120;
export const MAX_OPERATOR_DESCRIPTION = 500;
export const MAX_OPERATOR_TOKEN_LABEL = 60;

export type SessionTenant =
  | { ok: true; userId: string; tenantId: string }
  | { ok: false; response: NextResponse };

/**
 * Resolve the Better Auth session and request tenant for account-management
 * routes. Operator credentials cannot manage operators; only sessions can.
 */
export async function getSessionAndTenant(): Promise<SessionTenant> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
  if (!tenant) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "tenant_not_found" },
        { status: 404 },
      ),
    };
  }
  return { ok: true, userId: session.user.id, tenantId: tenant.id };
}

export type OperatorTokenSummary = {
  id: string;
  label: string | null;
  tokenPrefix: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
};

export type OperatorSummary = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  scope: OperatorScope | null;
  createdAt: Date;
  updatedAt: Date;
  tokens: OperatorTokenSummary[];
};

/** Active operators owned by the session user, with active token metadata. */
export async function listOperatorsForUser(
  userId: string,
  tenantId: string,
): Promise<OperatorSummary[]> {
  const operators = await db()
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
        eq(operator.userId, userId),
        eq(operator.tenantId, tenantId),
        isNull(operator.revokedAt),
      ),
    )
    .orderBy(desc(operator.createdAt));

  if (operators.length === 0) return [];

  const tokens = await db()
    .select({
      id: operatorToken.id,
      operatorId: operatorToken.operatorId,
      label: operatorToken.label,
      tokenPrefix: operatorToken.tokenPrefix,
      expiresAt: operatorToken.expiresAt,
      lastUsedAt: operatorToken.lastUsedAt,
      createdAt: operatorToken.createdAt,
      revokedAt: operatorToken.revokedAt,
    })
    .from(operatorToken)
    .where(
      and(
        inArray(
          operatorToken.operatorId,
          operators.map((row) => row.id),
        ),
        eq(operatorToken.tenantId, tenantId),
        isNull(operatorToken.revokedAt),
      ),
    )
    .orderBy(desc(operatorToken.createdAt));

  const byOperator = new Map<string, OperatorTokenSummary[]>();
  for (const token of tokens) {
    const list = byOperator.get(token.operatorId) ?? [];
    list.push({
      id: token.id,
      label: token.label,
      tokenPrefix: token.tokenPrefix,
      expiresAt: token.expiresAt,
      lastUsedAt: token.lastUsedAt,
      createdAt: token.createdAt,
      revokedAt: token.revokedAt,
    });
    byOperator.set(token.operatorId, list);
  }

  return operators.map((row) => {
    const scope = row.scope as OperatorScope | null;
    return {
      ...row,
      scope,
      tokens: byOperator.get(row.id) ?? [],
    };
  });
}

export type OperatorScopeValidation =
  | { ok: true; scope: OperatorScope }
  | { ok: false; error: "invalid_scope" | "no_owned_organizations" };

/**
 * Validate a requested scope against the owner's live memberships. Explicit
 * organization lists must be a subset of current memberships; `all_owned`
 * requires the owner to currently own at least one organization.
 */
export async function validateOperatorScope(input: {
  tenantId: string;
  userId: string;
  scope: OperatorScope;
}): Promise<OperatorScopeValidation> {
  const organizations = await listUserOrganizations(
    input.tenantId,
    input.userId,
  );
  if (input.scope.mode === "all_owned") {
    if (!organizations.some((org) => org.role === "owner")) {
      return { ok: false, error: "no_owned_organizations" };
    }
    return { ok: true, scope: input.scope };
  }
  const reachable = new Set(organizations.map((org) => org.id));
  if (!input.scope.organizationIds.every((id) => reachable.has(id))) {
    return { ok: false, error: "invalid_scope" };
  }
  return { ok: true, scope: input.scope };
}

export type CreatedOperator = {
  operator: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    scope: OperatorScope;
    createdAt: Date;
  };
  token: OperatorTokenSummary;
  plaintext: string;
};

/** Create an operator and its first token atomically. */
export async function createOperatorWithToken(input: {
  userId: string;
  tenantId: string;
  name: string;
  description: string | null;
  scope: OperatorScope;
  expiration: OperatorTokenExpiration;
  label: string | null;
}): Promise<CreatedOperator> {
  const plaintext = generateOperatorTokenPlaintext();
  const expiresAt = expirationToDate(input.expiration);

  const result = await withDbTransaction(async (tx) => {
    const [createdOperator] = await tx
      .insert(operator)
      .values({
        id: nanoid(),
        tenantId: input.tenantId,
        userId: input.userId,
        name: input.name,
        description: input.description,
        scope: input.scope,
      })
      .returning({
        id: operator.id,
        name: operator.name,
        description: operator.description,
        status: operator.status,
        scope: operator.scope,
        createdAt: operator.createdAt,
      });

    const [createdToken] = await tx
      .insert(operatorToken)
      .values({
        id: nanoid(),
        tenantId: input.tenantId,
        operatorId: createdOperator.id,
        label: input.label,
        tokenHash: hashOperatorToken(plaintext),
        tokenPrefix: operatorTokenDisplayPrefix(plaintext),
        expiresAt,
      })
      .returning({
        id: operatorToken.id,
        label: operatorToken.label,
        tokenPrefix: operatorToken.tokenPrefix,
        expiresAt: operatorToken.expiresAt,
        lastUsedAt: operatorToken.lastUsedAt,
        createdAt: operatorToken.createdAt,
        revokedAt: operatorToken.revokedAt,
      });

    return { createdOperator, createdToken };
  });

  return {
    operator: {
      ...result.createdOperator,
      scope: result.createdOperator.scope as OperatorScope,
    },
    token: result.createdToken,
    plaintext,
  };
}

/** Issue an additional token for an existing operator. */
export async function issueOperatorToken(input: {
  operatorId: string;
  tenantId: string;
  expiration: OperatorTokenExpiration;
  label: string | null;
}): Promise<{ token: OperatorTokenSummary; plaintext: string }> {
  const plaintext = generateOperatorTokenPlaintext();
  const [created] = await db()
    .insert(operatorToken)
    .values({
      id: nanoid(),
      tenantId: input.tenantId,
      operatorId: input.operatorId,
      label: input.label,
      tokenHash: hashOperatorToken(plaintext),
      tokenPrefix: operatorTokenDisplayPrefix(plaintext),
      expiresAt: expirationToDate(input.expiration),
    })
    .returning({
      id: operatorToken.id,
      label: operatorToken.label,
      tokenPrefix: operatorToken.tokenPrefix,
      expiresAt: operatorToken.expiresAt,
      lastUsedAt: operatorToken.lastUsedAt,
      createdAt: operatorToken.createdAt,
      revokedAt: operatorToken.revokedAt,
    });

  return { token: created, plaintext };
}

export type OwnedOperator = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  scope: unknown;
};

/** Fetch an active, non-revoked operator owned by the session user. */
export async function findOwnedOperator(input: {
  userId: string;
  tenantId: string;
  operatorId: string;
}): Promise<OwnedOperator | null> {
  const [row] = await db()
    .select({
      id: operator.id,
      name: operator.name,
      description: operator.description,
      status: operator.status,
      scope: operator.scope,
    })
    .from(operator)
    .where(
      and(
        eq(operator.id, input.operatorId),
        eq(operator.userId, input.userId),
        eq(operator.tenantId, input.tenantId),
        isNull(operator.revokedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Revoke one token of an owned operator. Returns false when not found. */
export async function revokeOwnedOperatorToken(input: {
  userId: string;
  tenantId: string;
  operatorId: string;
  tokenId: string;
}): Promise<boolean> {
  const owned = await findOwnedOperator(input);
  if (!owned) return false;
  const revoked = await db()
    .update(operatorToken)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(operatorToken.id, input.tokenId),
        eq(operatorToken.operatorId, input.operatorId),
        eq(operatorToken.tenantId, input.tenantId),
        isNull(operatorToken.revokedAt),
      ),
    )
    .returning({ id: operatorToken.id });
  return revoked.length > 0;
}
