import { getAdminSession } from "@/lib/admin-auth";
import { parseRange } from "@repo/analytics/admin-range";
import {
  assertPosthogConfigured,
  getPageFlowFunnel,
} from "@repo/analytics/posthog-query";
import { db, eq } from "@repo/database";
import { analyticsFunnel } from "@repo/database";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
