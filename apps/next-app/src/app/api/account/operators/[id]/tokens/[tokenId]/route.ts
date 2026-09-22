import {
  getSessionAndTenant,
  revokeOwnedOperatorToken,
} from "@/lib/operators/management";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
