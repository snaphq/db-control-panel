import { auth } from "@repo/auth/server";
import { and, db, eq, resolveTenantFromHost } from "@repo/database";
import { accountApiToken } from "@repo/database/schema";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
  if (!tenant)
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

  const { id } = await params;
  const result = await db()
    .update(accountApiToken)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(accountApiToken.id, id),
        eq(accountApiToken.userId, session.user.id),
        eq(accountApiToken.tenantId, tenant.id),
      ),
    )
    .returning({ id: accountApiToken.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
