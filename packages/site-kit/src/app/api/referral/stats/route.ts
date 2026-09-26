import { auth } from "@repo/auth/server";
import { getReferralStats } from "@repo/billing";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const stats = await getReferralStats(session.user.id);
  return NextResponse.json(stats);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
