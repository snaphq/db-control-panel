import {
  listOperatorActivity,
  serializeOperatorActivity,
} from "@repo/core/operators/detail";
import {
  findOwnedOperator,
  getSessionAndTenant,
} from "@repo/core/operators/management";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
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
    return NextResponse.json({ error: "operator_not_found" }, { status: 404 });
  }

  const search = req.nextUrl.searchParams;
  const credentialId = search.get("credentialId")?.trim() || undefined;
  const rawLimit = search.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;

  const entries = await listOperatorActivity({
    userId: auth.userId,
    tenantId: auth.tenantId,
    operatorId: existing.id,
    credentialId,
    limit: Number.isNaN(limit) ? undefined : limit,
  });
  return NextResponse.json({ entries: entries.map(serializeOperatorActivity) });
}
