import { parseRange } from "@repo/analytics/admin-range";
import {
  assertPosthogConfigured,
  getChannelBreakdown,
  getDeviceBreakdown,
  getTopCountries,
  getTopLandingPages,
  getTopReferringDomains,
  getTopUtmCampaigns,
  getUtmSourceMediumMatrix,
} from "@repo/analytics/posthog-query";
import { auth } from "@repo/auth/server";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
  { params }: { params: Promise<{ snapshot: string }> },
) {
  const denied = await gate();
  if (denied) return denied;

  const cfg = assertPosthogConfigured();
  if (!cfg.ok) {
    return NextResponse.json({ error: cfg.reason }, { status: 503 });
  }

  const { snapshot } = await params;
  const range = parseRange(request.nextUrl.searchParams.get("range"));
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 10, 1), 50);

  try {
    let data: unknown;
    switch (snapshot) {
      case "channels":
        data = await getChannelBreakdown(range);
        break;
      case "referrers":
        data = await getTopReferringDomains(range, limit);
        break;
      case "utm-campaigns":
        data = await getTopUtmCampaigns(range, limit);
        break;
      case "utm-source-medium":
        data = await getUtmSourceMediumMatrix(range, limit);
        break;
      case "landing-pages":
        data = await getTopLandingPages(range, limit);
        break;
      case "device":
        data = await getDeviceBreakdown(range);
        break;
      case "countries":
        data = await getTopCountries(range, limit);
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
    console.error("posthog snapshot failed", snapshot, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
