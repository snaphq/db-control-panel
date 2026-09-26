import { PromoCodeTable } from "@/components/admin/stripe/PromoCodeTable";
import { getStripePromotionCodes } from "@repo/billing/stripe/queries";
import { Button } from "@repo/react-ui/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";

type PromoCodeRows = Parameters<typeof PromoCodeTable>[0]["promoCodes"];

export default async function PromoCodesPage() {
  const promoCodes: PromoCodeRows = (
    await getStripePromotionCodes({
      limit: 100,
    })
  ).map((promoCode) => ({
    id: promoCode.id,
    code: promoCode.code ?? promoCode.id,
    active: promoCode.active,
    percent_off: promoCode.coupon.percent_off ?? null,
    amount_off: promoCode.coupon.amount_off ?? null,
    coupon_currency: promoCode.coupon.currency ?? null,
    coupon_name: promoCode.coupon.name ?? null,
    times_redeemed: promoCode.times_redeemed,
    max_redemptions: promoCode.max_redemptions ?? null,
    expires_at: promoCode.expires_at ?? null,
    coupon: {
      id: promoCode.coupon.id,
      name: promoCode.coupon.name ?? undefined,
    },
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">
            Promotion Codes
          </h1>
          <p className="text-muted-foreground">
            Create and manage customer-facing promo codes
          </p>
        </div>
        <Button asChild>
          <Link href="/stripe/promo-codes/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Promo Code
          </Link>
        </Button>
      </div>

      <PromoCodeTable promoCodes={promoCodes} />
    </div>
  );
}
