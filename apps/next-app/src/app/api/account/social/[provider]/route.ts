import { auth } from "@repo/auth/server";
import { and, db, eq, resolveTenantFromHost } from "@repo/database";
import { account } from "@repo/database/schema";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SUPPORTED = new Set(["google", "github"]);

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const requestHeaders = await headers();
  const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { provider } = await params;
  if (!SUPPORTED.has(provider)) {
    return NextResponse.json(
      { error: "unsupported_provider" },
      { status: 400 },
    );
  }

  const rows = await db()
    .select({ providerId: account.providerId })
    .from(account)
    .where(
      and(eq(account.userId, session.user.id), eq(account.tenantId, tenant.id)),
    );

  const hasMatching = rows.some((r) => r.providerId === provider);
  if (!hasMatching) {
    return NextResponse.json({ error: "not_connected" }, { status: 404 });
  }

  const hasOther = rows.some((r) => r.providerId !== provider);
  if (!hasOther) {
    return NextResponse.json({ error: "last_sign_in_method" }, { status: 400 });
  }

  await db()
    .delete(account)
    .where(
      and(
        eq(account.userId, session.user.id),
        eq(account.providerId, provider),
        eq(account.tenantId, tenant.id),
      ),
    );

  return NextResponse.json({ ok: true });
}
