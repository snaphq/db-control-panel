import { parseRange } from "@repo/analytics/admin-range";
import {
  assertPosthogConfigured,
  getTrafficKpis,
} from "@repo/analytics/posthog-query";
import { auth } from "@repo/auth/server";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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
