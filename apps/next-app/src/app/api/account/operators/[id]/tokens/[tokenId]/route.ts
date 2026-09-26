import {
  serializeOperatorToken,
  updateOwnedOperatorTokenLabel,
} from "@repo/core/operators/detail";
import {
  getSessionAndTenant,
  revokeOwnedOperatorToken,
} from "@repo/core/operators/management";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tokenId: string }> },
) {
  const auth = await getSessionAndTenant();
  if (!auth.ok) return auth.response;
  const { id, tokenId } = await params;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const label = (body as Record<string, unknown>).label;
  if (label !== null && typeof label !== "string") {
    return NextResponse.json({ error: "invalid_label" }, { status: 400 });
  }

  const result = await updateOwnedOperatorTokenLabel({
    userId: auth.userId,
    tenantId: auth.tenantId,
    operatorId: id,
    tokenId,
    label,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json({ token: serializeOperatorToken(result.token) });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; tokenId: string }> },
) {
  const auth = await getSessionAndTenant();
  if (!auth.ok) return auth.response;
  const { id, tokenId } = await params;

  const revoked = await revokeOwnedOperatorToken({
    userId: auth.userId,
    tenantId: auth.tenantId,
    operatorId: id,
    tokenId,
  });
  if (!revoked) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
