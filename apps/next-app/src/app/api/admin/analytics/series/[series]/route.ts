import { parseRange } from "@repo/analytics/admin-range";
import { auth } from "@repo/auth/server";
import {
  type SeriesResult,
  getRevenueSeries,
  getSessionsSeries,
  getSignupsSeries,
  getWorkspacesSeries,
} from "@repo/core/admin/analytics";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Series = "signups" | "revenue" | "workspaces" | "sessions";

async function gate() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = await getSiteAdminStatus(session.user.id);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ series: string }> },
) {
  const denied = await gate();
  if (denied) return denied;

  const { series } = await params;
  const range = parseRange(request.nextUrl.searchParams.get("range"));

  try {
    let data: SeriesResult;
    switch (series as Series) {
      case "signups":
        data = await getSignupsSeries(range);
        break;
      case "revenue":
        data = await getRevenueSeries(range);
        break;
      case "workspaces":
        data = await getWorkspacesSeries(range);
        break;
      case "sessions":
        data = await getSessionsSeries(range);
        break;
      default:
        return NextResponse.json({ error: "Unknown series" }, { status: 400 });
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    console.error("admin analytics series failed", series, err);
    return NextResponse.json(
      { error: "Failed to load analytics" },
      { status: 500 },
    );
  }
}
