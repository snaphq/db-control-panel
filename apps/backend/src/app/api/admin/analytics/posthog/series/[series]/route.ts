import { getAdminSession } from "@/lib/admin-auth";
import { parseRange } from "@repo/analytics/admin-range";
import {
  assertPosthogConfigured,
  getPageviewsSeries,
} from "@repo/analytics/posthog-query";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function gate() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ series: string }> },
) {
  const denied = await gate();
  if (denied) return denied;

  const cfg = assertPosthogConfigured();
  if (!cfg.ok) {
    return NextResponse.json({ error: cfg.reason }, { status: 503 });
  }

  const { series } = await params;
  const range = parseRange(request.nextUrl.searchParams.get("range"));

  try {
    if (series === "pageviews") {
      const data = await getPageviewsSeries(range);
      return NextResponse.json(data, {
        headers: { "Cache-Control": "private, max-age=60" },
      });
    }
    return NextResponse.json({ error: "Unknown series" }, { status: 400 });
  } catch (err) {
    console.error("posthog series failed", series, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
