import { auth } from "@repo/auth/server";
import {
  getOrCreateReferralCode,
  isUserEligibleForReferralCode,
} from "@repo/billing";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

/**
 * GET /api/referral/code
 * Returns the user's referral code (lazily created on first call) plus the
 * shareable link. Returns 403 if the user is not eligible for a referral code.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eligible = await isUserEligibleForReferralCode(session.user.id);
  if (!eligible) {
    return NextResponse.json({ error: "not_eligible" }, { status: 403 });
  }

  const code = await getOrCreateReferralCode(session.user.id);
  const url = new URL(request.url);
  const origin = url.origin;
  return NextResponse.json({
    code: code.code,
    shareUrl: `${origin}/r/${code.code}`,
    isActive: code.isActive,
    usageCount: code.usageCount,
    totalCreditsEarnedCents: code.totalCreditsEarned,
  });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
