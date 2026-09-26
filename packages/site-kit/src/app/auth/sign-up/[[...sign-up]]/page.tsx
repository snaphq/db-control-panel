import { getReferralCodeByCode, getReferralConfig } from "@repo/billing";
import { db, eq } from "@repo/database";
import { user } from "@repo/database/schema";
import { cookies } from "next/headers";
import { SignUpForm } from "./_components/SignUpForm";

export default async function SignUpPage() {
  let referralBanner: {
    referrerFirstName: string | null;
    creditAmountCents: number;
    currency: string;
  } | null = null;

  try {
    const jar = await cookies();
    const referralCookieValue = jar.get("referral_code")?.value;

    if (referralCookieValue) {
      const [referralCode, cfg] = await Promise.all([
        getReferralCodeByCode(referralCookieValue),
        getReferralConfig(),
      ]);

      if (referralCode?.isActive) {
        const ownerRows = await db()
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, referralCode.userId))
          .limit(1);

        const firstName = ownerRows[0]?.name?.split(" ")[0] ?? null;

        referralBanner = {
          referrerFirstName: firstName,
          creditAmountCents: cfg.refereeCreditAmount,
          currency: cfg.currency,
        };
      }
    }
  } catch {
    // Non-critical — proceed without banner if anything fails.
  }

  return <SignUpForm referralBanner={referralBanner} />;
}
