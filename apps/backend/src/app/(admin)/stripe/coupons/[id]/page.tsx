import { ActionsMenu } from "@/components/admin/stripe/ActionsMenu";
// import { getStripeCoupon, getStripeProduct } from "@repo/billing/stripe/queries";
import { getStripeCoupon } from "@repo/billing/stripe/queries";
import { Badge } from "@repo/react-ui/components/ui/badge";
import { Button } from "@repo/react-ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/react-ui/components/ui/card";
// import { ProductTable } from "@/components/admin/stripe/ProductTable";
// import type { Product } from "@repo/billing/stripe/client";
import { Label } from "@repo/react-ui/components/ui/label";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function CouponDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const coupon = await getStripeCoupon(id);

  if (!coupon) {
    notFound();
  }

  // Debug log to check the raw coupon data from Stripe
  console.log("Stripe Coupon Data:", JSON.stringify(coupon, null, 2));
  console.log("Has applies_to?", !!coupon.applies_to);
  if (coupon.applies_to) {
    console.log("applies_to products:", coupon.applies_to.products);
  }

  // type CouponScope =
  //   | { type: "specific"; products: Product[] }
  //   | { type: "global" };

  // let couponScope: CouponScope;

  // if (
  //   coupon.applies_to &&
  //   Array.isArray(coupon.applies_to.products) &&
  //   coupon.applies_to.products.length > 0
  // ) {
  //   const products: Product[] = [];
  //   for (const productId of coupon.applies_to.products) {
  //     const product = await getStripeProduct(productId);
  //     if (product) {
  //       products.push(product as unknown as Product);
  //     }
  //   }
  //   couponScope = { type: "specific", products };
  // } else {
  //   couponScope = { type: "global" };
  // }

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return "No expiration";
    return new Date(timestamp * 1000).toLocaleString();
  };

  const formatDiscount = () => {
    if (coupon.percent_off) {
      return `${coupon.percent_off}% off`;
    }
    if (coupon.amount_off && coupon.currency) {
      const amount = (coupon.amount_off as number) / 100;
      return `${(coupon.currency as string).toUpperCase()} ${amount} off`;
    }
    return "N/A";
  };

  const formatDuration = () => {
    if (coupon.duration === "once") return "One time";
    if (coupon.duration === "forever") return "Forever";
    if (coupon.duration === "repeating" && coupon.duration_in_months) {
      return `${coupon.duration_in_months} months`;
    }
    return coupon.duration;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">
            Coupon Details
          </h1>
          <p className="text-muted-foreground">View coupon information</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/stripe/coupons">Back to Coupons</Link>
          </Button>
          <Button asChild variant="outline">
            <Link
              href={`https://dashboard.stripe.com/coupons/${coupon.id}`}
              target="_blank"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View in Stripe
            </Link>
          </Button>
          <ActionsMenu
            itemType="coupon"
            itemId={coupon.id as string}
            itemName={(coupon.name as string) || (coupon.id as string)}
            stripeUrl={`https://dashboard.stripe.com/coupons/${coupon.id}`}
            redirectAfterDelete="/stripe/coupons"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Coupon Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Coupon Code</Label>
              <p className="font-mono text-lg font-semibold">
                {coupon.id as string}
              </p>
            </div>
            {(coupon.name as string) && (
              <div>
                <Label className="text-muted-foreground">Name</Label>
                <p>{coupon.name as string}</p>
              </div>
            )}
            <div>
              <Label className="text-muted-foreground">Discount</Label>
              <p className="text-lg font-semibold">{formatDiscount()}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Duration</Label>
              <p>{formatDuration() as string}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Redemption & Validity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Redemptions</Label>
              <p>
                {(coupon.times_redeemed as number) || 0}
                {(coupon.max_redemptions as number) &&
                  ` / ${coupon.max_redemptions}`}{" "}
                times used
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground">Expiration</Label>
              <p>{formatDate(coupon.redeem_by as number)}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Status</Label>
              <div>
                <Badge
                  variant={(coupon.valid as boolean) ? "default" : "secondary"}
                >
                  {coupon.valid ? "Valid" : "Invalid"}
                </Badge>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Created</Label>
              <p className="text-sm">{formatDate(coupon.created as number)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* <Card>
        <CardHeader>
          <CardTitle>Applied Products</CardTitle>
        </CardHeader>
        <CardContent>
          {couponScope.type === "specific" ? (
            <ProductTable products={couponScope.products} />
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground border rounded-lg bg-muted/10">
              <p className="font-medium text-foreground">
                Applies to all eligible products
              </p>
              <p className="text-sm">
                This coupon is not restricted to specific products.
              </p>
            </div>
          )}
        </CardContent>
      </Card> */}
    </div>
  );
}
