import { getReferralCodeByCode, getReferralConfig } from "@repo/billing";
import { db, eq } from "@repo/database";
import { user } from "@repo/database/schema";
import { NextResponse } from "next/server";

/**
 * GET /api/referral/validate/[code]
 * Public — used by the pricing page to render a "referred by ..." banner
 * when ?ref=CODE is present in the URL.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const referralCode = await getReferralCodeByCode(code.trim().toUpperCase());

  if (!referralCode || !referralCode.isActive) {
    return NextResponse.json({ valid: false }, { status: 200 });
  }

  const [owner, cfg] = await Promise.all([
    db()
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, referralCode.userId))
      .limit(1),
    getReferralConfig(),
  ]);

  return NextResponse.json({
    valid: true,
    referrerFirstName: owner[0]?.name?.split(" ")[0] ?? null,
    refereeCreditCents: cfg.refereeCreditAmount,
    currency: cfg.currency,
  });
}

export const runtime = "nodejs";
