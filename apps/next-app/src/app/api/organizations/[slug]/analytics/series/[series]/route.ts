import { parseRange } from "@repo/analytics/admin-range";
import {
  type SeriesResult,
  getRevenueSeries,
  getSessionsSeries,
  getSignupsSeries,
} from "@repo/core/admin/analytics";
import { requireOrganizationMembership } from "@repo/core/auth/require-membership";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Series = "signups" | "revenue" | "sessions";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; series: string }> },
) {
  const { slug, series } = await params;

  let organizationId: string;
  try {
    const { organization } = await requireOrganizationMembership(slug);
    organizationId = organization.id;
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const range = parseRange(request.nextUrl.searchParams.get("range"));

  try {
    let data: SeriesResult;
    switch (series as Series) {
      case "signups":
        data = await getSignupsSeries(range, organizationId);
        break;
      case "revenue":
        data = await getRevenueSeries(range, organizationId);
        break;
      case "sessions":
        data = await getSessionsSeries(range, organizationId);
        break;
      default:
        return NextResponse.json({ error: "Unknown series" }, { status: 400 });
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    console.error("org analytics series failed", series, err);
    return NextResponse.json(
      { error: "Failed to load analytics" },
      { status: 500 },
    );
  }
}
