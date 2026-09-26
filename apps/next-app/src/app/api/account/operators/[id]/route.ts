import { parseOperatorScope } from "@/lib/auth/operator-token";
import {
  getOwnedOperatorDetail,
  serializeOperatorDetail,
} from "@/lib/operators/detail";
import {
  MAX_OPERATOR_DESCRIPTION,
  MAX_OPERATOR_NAME,
  findOwnedOperator,
  getSessionAndTenant,
  validateOperatorScope,
} from "@/lib/operators/management";
import { and, db, eq, isNull } from "@repo/database";
import { operator } from "@repo/database/schema-operators";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const OPERATOR_STATUSES = new Set(["active", "suspended"]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getSessionAndTenant();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const detail = await getOwnedOperatorDetail({
    userId: auth.userId,
    tenantId: auth.tenantId,
    operatorId: id,
  });
  if (!detail) {
    return NextResponse.json({ error: "operator_not_found" }, { status: 404 });
  }
  return NextResponse.json({ operator: serializeOperatorDetail(detail) });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getSessionAndTenant();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const existing = await findOwnedOperator({
    userId: auth.userId,
    tenantId: auth.tenantId,
    operatorId: id,
  });
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const updates: {
    name?: string;
    description?: string | null;
    scope?: unknown;
    status?: string;
  } = {};

  if (record.name !== undefined) {
    if (typeof record.name !== "string") {
      return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    }
    const name = record.name.trim();
    if (!name || name.length > MAX_OPERATOR_NAME) {
      return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    }
    updates.name = name;
  }

  if (record.description !== undefined) {
    if (record.description !== null && typeof record.description !== "string") {
      return NextResponse.json(
        { error: "invalid_description" },
        { status: 400 },
      );
    }
    const description =
      typeof record.description === "string" ? record.description.trim() : "";
    if (description.length > MAX_OPERATOR_DESCRIPTION) {
      return NextResponse.json(
        { error: "description_too_long" },
        { status: 400 },
      );
    }
    updates.description = description.length > 0 ? description : null;
  }

  if (record.scope !== undefined) {
    const scope = parseOperatorScope(record.scope);
    if (!scope) {
      return NextResponse.json({ error: "invalid_scope" }, { status: 400 });
    }
    const scopeValidation = await validateOperatorScope({
      tenantId: auth.tenantId,
      userId: auth.userId,
      scope,
    });
    if (!scopeValidation.ok) {
      return NextResponse.json(
        { error: scopeValidation.error },
        { status: 400 },
      );
    }
    updates.scope = scopeValidation.scope;
  }

  if (record.status !== undefined) {
    if (
      typeof record.status !== "string" ||
      !OPERATOR_STATUSES.has(record.status)
    ) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }
    updates.status = record.status;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no_updates" }, { status: 400 });
  }

  const [updated] = await db()
    .update(operator)
    .set(updates)
    .where(
      and(
        eq(operator.id, id),
        eq(operator.userId, auth.userId),
        eq(operator.tenantId, auth.tenantId),
        isNull(operator.revokedAt),
      ),
    )
    .returning({
      id: operator.id,
      name: operator.name,
      description: operator.description,
      status: operator.status,
      scope: operator.scope,
      createdAt: operator.createdAt,
      updatedAt: operator.updatedAt,
    });

  return NextResponse.json({ operator: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getSessionAndTenant();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const revoked = await db()
    .update(operator)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(operator.id, id),
        eq(operator.userId, auth.userId),
        eq(operator.tenantId, auth.tenantId),
        isNull(operator.revokedAt),
      ),
    )
    .returning({ id: operator.id });

  if (revoked.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
