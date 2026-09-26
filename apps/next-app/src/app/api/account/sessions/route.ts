import { auth } from "@repo/auth/server";
import { sessionTokenFromCookieHeader } from "@repo/core/auth/session-cookie";
import { and, db, desc, eq, resolveTenantFromHost } from "@repo/database";
import { session } from "@repo/database/schema";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const reqHeaders = await headers();
  const result = await auth.api.getSession({ headers: reqHeaders });
  if (!result?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tenant = await resolveTenantFromHost(reqHeaders.get("host"));
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

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
            eq(session.userId, result.user.id),
            eq(session.tenantId, tenant.id),
          ),
        )
        .limit(1)
    : [];

  const rows = await db()
    .select({
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
    })
    .from(session)
    .where(
      and(eq(session.userId, result.user.id), eq(session.tenantId, tenant.id)),
    )
    .orderBy(desc(session.updatedAt));

  const sessions = rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    isCurrent: row.id === current?.id,
  }));

  return NextResponse.json({ sessions });
}
