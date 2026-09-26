import { ActionsMenu } from "@/components/admin/stripe/ActionsMenu";
import { getStripePromotionCode } from "@repo/billing/stripe/queries";
import { Badge } from "@repo/react-ui/components/ui/badge";
import { Button } from "@repo/react-ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/react-ui/components/ui/card";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function PromoCodeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const promoCode = await getStripePromotionCode(id);

  if (!promoCode) {
    notFound();
  }

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return "No expiration";
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  const formatDiscount = () => {
    if (promoCode.coupon.percent_off) {
      return `${promoCode.coupon.percent_off}% off`;
    }
    if (promoCode.coupon.amount_off) {
      const amount = promoCode.coupon.amount_off / 100;
      return `${promoCode.coupon.currency?.toUpperCase()} ${amount} off`;
    }
    return "N/A";
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">
            Promo Code Details
          </h1>
          <p className="text-muted-foreground">
            View promo code information and usage
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/stripe/promo-codes">Back to Promo Codes</Link>
          </Button>
          <Button asChild variant="outline">
            <Link
              href={`https://dashboard.stripe.com/promotion_codes/${promoCode.id}`}
              target="_blank"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View in Stripe
            </Link>
          </Button>
          <ActionsMenu
            itemType="promo-code"
            itemId={promoCode.id}
            itemName={promoCode.code}
            stripeUrl={`https://dashboard.stripe.com/promotion_codes/${promoCode.id}`}
            redirectAfterDelete="/stripe/promo-codes"
            isActive={promoCode.active}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Promo Code Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Code
              </dt>
              <dd className="text-2xl font-bold font-mono">{promoCode.code}</dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-muted-foreground">ID</dt>
              <dd className="font-mono text-sm">{promoCode.id}</dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Status
              </dt>
              <dd>
                <Badge variant={promoCode.active ? "default" : "secondary"}>
                  {promoCode.active ? "Active" : "Inactive"}
                </Badge>
              </dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Discount
              </dt>
              <dd className="text-lg font-semibold">{formatDiscount()}</dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Linked Coupon
              </dt>
              <dd className="flex items-center gap-2">
                <p className="font-mono text-sm">{promoCode.coupon.id}</p>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/stripe/coupons/${promoCode.coupon.id}`}>
                    View Coupon
                  </Link>
                </Button>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage & Limits</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Times Redeemed
              </dt>
              <dd className="text-lg font-semibold">
                {promoCode.times_redeemed || 0}
                {promoCode.max_redemptions && ` / ${promoCode.max_redemptions}`}
              </dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Expiration
              </dt>
              <dd>{formatDate(promoCode.expires_at)}</dd>
            </div>

            {promoCode.restrictions?.first_time_transaction && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Restrictions
                </dt>
                <dd>
                  <Badge variant="outline">First-time customers only</Badge>
                </dd>
              </div>
            )}

            {promoCode.restrictions?.minimum_amount && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Minimum Amount
                </dt>
                <dd>
                  {promoCode.coupon.currency?.toUpperCase()}{" "}
                  {promoCode.restrictions.minimum_amount / 100}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Created
              </dt>
              <dd>{new Date(promoCode.created * 1000).toLocaleString()}</dd>
            </div>

            {promoCode.metadata?.created_by && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Created By
                </dt>
                <dd>{promoCode.metadata.created_by}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
