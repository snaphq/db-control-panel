import { getPricingTiers } from "@repo/billing/stripe/queries";
import { NextResponse } from "next/server";

/**
 * GET /api/pricing
 * Public endpoint returning the configured pricing tiers.
 * Cached at the framework level via the "pricing" tag — admin mutations
 * call revalidateTag("pricing") to invalidate.
 */
export async function GET() {
  const tiers = await getPricingTiers();
  return NextResponse.json({ tiers });
}

export const revalidate = 3600; // 1h fallback
