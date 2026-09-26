import { isValidExpiration } from "@repo/core/auth/operator-token";
import {
  MAX_OPERATOR_TOKEN_LABEL,
  findOwnedOperator,
  getSessionAndTenant,
  issueOperatorToken,
} from "@repo/core/operators/management";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
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

  const expiration =
    typeof record.expiration === "string" ? record.expiration : "";
  if (!isValidExpiration(expiration)) {
    return NextResponse.json({ error: "invalid_expiration" }, { status: 400 });
  }

  const label = typeof record.label === "string" ? record.label.trim() : "";
  if (label.length > MAX_OPERATOR_TOKEN_LABEL) {
    return NextResponse.json({ error: "label_too_long" }, { status: 400 });
  }

  if (existing.status !== "active") {
    return NextResponse.json({ error: "operator_not_active" }, { status: 403 });
  }

  const created = await issueOperatorToken({
    operatorId: existing.id,
    tenantId: auth.tenantId,
    expiration,
    label: label.length > 0 ? label : null,
  });

  return NextResponse.json(created, { status: 201 });
}
