import { getAdminSession } from "@/lib/admin-auth";
import { parseRange } from "@repo/analytics/admin-range";
import {
  assertPosthogConfigured,
  getTrafficKpis,
} from "@repo/analytics/posthog-query";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cfg = assertPosthogConfigured();
  if (!cfg.ok) {
    return NextResponse.json({ error: cfg.reason }, { status: 503 });
  }

  const range = parseRange(request.nextUrl.searchParams.get("range"));

  try {
    const data = await getTrafficKpis(range);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    console.error("posthog kpis failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
