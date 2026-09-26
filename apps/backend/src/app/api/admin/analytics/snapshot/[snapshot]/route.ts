import { getAdminSession } from "@/lib/admin-auth";
import { parseRange } from "@repo/analytics/admin-range";
import {
  getOrgStatusBreakdown,
  getPlanDistribution,
  getTopOrgsByRevenue,
} from "@repo/core/admin/analytics";
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
  { params }: { params: Promise<{ snapshot: string }> },
) {
  const denied = await gate();
  if (denied) return denied;

  const { snapshot } = await params;
  const range = parseRange(request.nextUrl.searchParams.get("range"));
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 10, 1), 50);

  try {
    let data: unknown;
    switch (snapshot) {
      case "org-status":
        data = await getOrgStatusBreakdown();
        break;
      case "plan-distribution":
        data = await getPlanDistribution();
        break;
      case "top-orgs":
        data = await getTopOrgsByRevenue(range, limit);
        break;
      default:
        return NextResponse.json(
          { error: "Unknown snapshot" },
          { status: 400 },
        );
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    console.error("admin analytics snapshot failed", snapshot, err);
    return NextResponse.json(
      { error: "Failed to load analytics" },
      { status: 500 },
    );
  }
}
