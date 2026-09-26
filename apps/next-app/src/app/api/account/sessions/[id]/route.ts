import { auth } from "@repo/auth/server";
import { recordUserAudit } from "@repo/core/audit/user-audit";
import { sessionTokenFromCookieHeader } from "@repo/core/auth/session-cookie";
import { and, db, eq, inArray, resolveTenantFromHost } from "@repo/database";
import { session } from "@repo/database/schema";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const reqHeaders = await headers();
  const result = await auth.api.getSession({ headers: reqHeaders });
  if (!result?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tenant = await resolveTenantFromHost(reqHeaders.get("host"));
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  const userId = result.user.id;
  const { id } = await params;
  const currentSessionToken = sessionTokenFromCookieHeader(
    reqHeaders.get("cookie"),
  );
  const [current] = currentSessionToken
    ? await db()
        .select({ id: session.id })
        .from(session)
        .where(
          and(
            eq(session.token, currentSessionToken),
            eq(session.userId, userId),
            eq(session.tenantId, tenant.id),
          ),
        )
        .limit(1)
    : [];

  // Special token "all-others" revokes every session except the current one
  if (id === "all-others") {
    const userSessions = await db()
      .select({ id: session.id })
      .from(session)
      .where(and(eq(session.userId, userId), eq(session.tenantId, tenant.id)));

    const idsToRevoke = userSessions
      .filter((s) => s.id !== current?.id)
      .map((s) => s.id);

    if (idsToRevoke.length > 0) {
      await db()
        .delete(session)
        .where(
          and(
            eq(session.userId, userId),
            eq(session.tenantId, tenant.id),
            inArray(session.id, idsToRevoke),
          ),
        );
      await recordUserAudit({
        userId,
        action: "session.revoked_others",
        metadata: { revokedCount: idsToRevoke.length },
        headers: reqHeaders,
      });
    }

    return NextResponse.json({ revoked: idsToRevoke.length });
  }

  const [target] = await db()
    .select({ id: session.id })
    .from(session)
    .where(
      and(
        eq(session.id, id),
        eq(session.userId, userId),
        eq(session.tenantId, tenant.id),
      ),
    )
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (target.id === current?.id) {
    return NextResponse.json(
      { error: "cannot_revoke_current_session" },
      { status: 400 },
    );
  }

  await db()
    .delete(session)
    .where(
      and(
        eq(session.id, id),
        eq(session.userId, userId),
        eq(session.tenantId, tenant.id),
      ),
    );

  await recordUserAudit({
    userId,
    action: "session.revoked",
    metadata: { sessionId: id },
    headers: reqHeaders,
  });

  return NextResponse.json({ ok: true });
}
