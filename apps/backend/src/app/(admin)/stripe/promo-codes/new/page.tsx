import { PromoCodeForm } from "@/components/admin/stripe/PromoCodeForm";
import { stripe } from "@repo/billing/stripe/client";
import { Button } from "@repo/react-ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/react-ui/components/ui/card";
import Link from "next/link";

async function getActiveCoupons() {
  try {
    const coupons = await stripe.coupons.list({ limit: 100 });
    return coupons.data.filter((coupon) => coupon.valid);
  } catch (error) {
    console.error("Error fetching coupons:", error);
    return [];
  }
}

export default async function NewPromoCodePage() {
  const coupons = await getActiveCoupons();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">
            Create Promo Code
          </h1>
          <p className="text-muted-foreground">
            Create a new customer-facing promo code
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/stripe/promo-codes">Back to Promo Codes</Link>
        </Button>
      </div>

      {coupons.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Coupons Available</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              You need to create at least one coupon before creating promo
              codes.
            </p>
            <Button asChild>
              <Link href="/stripe/coupons/new">Create Coupon</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <PromoCodeForm coupons={coupons} mode="create" />
      )}
    </div>
  );
}
