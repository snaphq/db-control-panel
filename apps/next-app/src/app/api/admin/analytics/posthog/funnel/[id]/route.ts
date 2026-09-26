import { parseRange } from "@repo/analytics/admin-range";
import {
  assertPosthogConfigured,
  getPageFlowFunnel,
} from "@repo/analytics/posthog-query";
import { auth } from "@repo/auth/server";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { db, eq } from "@repo/database";
import { analyticsFunnel } from "@repo/database";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = await getSiteAdminStatus(session.user.id);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cfg = assertPosthogConfigured();
  if (!cfg.ok) {
    return NextResponse.json({ error: cfg.reason }, { status: 503 });
  }

  const { id } = await params;
  const range = parseRange(request.nextUrl.searchParams.get("range"));

  const [funnel] = await db()
    .select()
    .from(analyticsFunnel)
    .where(eq(analyticsFunnel.id, id))
    .limit(1);

  if (!funnel) {
    return NextResponse.json({ error: "Funnel not found" }, { status: 404 });
  }

  try {
    const data = await getPageFlowFunnel(funnel, range);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    console.error("posthog funnel failed", id, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
