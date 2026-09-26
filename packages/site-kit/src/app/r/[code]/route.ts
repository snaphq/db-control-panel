import { captureReferralIntent, getReferralCodeByCode } from "@repo/billing";
import { NextResponse } from "next/server";

const REFERRAL_COOKIE_NAME = "referral_code";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * GET /r/[code]
 * Capture a referral code: set HTTP-only cookie, log a referral_intents row,
 * then redirect to the public pricing page (or sign-up).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const normalized = code.trim().toUpperCase();

  const referralCode = await getReferralCodeByCode(normalized);
  const url = new URL(request.url);

  if (!referralCode || !referralCode.isActive) {
    // Invalid/expired code — drop straight to the pricing page without setting the cookie.
    return NextResponse.redirect(new URL("/", url));
  }

  // Best-effort intent capture (failure is non-fatal).
  try {
    await captureReferralIntent({ code: referralCode.code });
  } catch (err) {
    console.error("[/r/code] Failed to capture referral intent:", err);
  }

  const dest = new URL("/", url);
  dest.searchParams.set("ref", referralCode.code);

  const response = NextResponse.redirect(dest);
  response.cookies.set({
    name: REFERRAL_COOKIE_NAME,
    value: referralCode.code,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
