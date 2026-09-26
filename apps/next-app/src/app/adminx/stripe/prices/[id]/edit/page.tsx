import { PriceEditForm } from "@/components/admin/stripe/PriceEditForm";
import type { Stripe } from "@repo/billing/stripe/client";
import { getStripePrice, getStripeProduct } from "@repo/billing/stripe/queries";
import { Button } from "@repo/ui/components/ui/button";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

function isStripePrice(price: unknown): price is Stripe.Price {
  return (
    typeof price === "object" &&
    price !== null &&
    "id" in price &&
    typeof (price as { id?: unknown }).id === "string"
  );
}

export default async function EditPricePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const priceData = await getStripePrice(id);

  if (!isStripePrice(priceData)) {
    notFound();
  }

  const price = priceData;
  const productId =
    typeof price.product === "string" ? price.product : price.product?.id || "";

  if (!productId) {
    notFound();
  }

  const product = await getStripeProduct(productId);
  const editablePrice = {
    id: price.id,
    productId,
    productName:
      (product && "name" in product ? (product.name as string) : null) ??
      (typeof price.product === "object" &&
      price.product &&
      "name" in price.product
        ? (price.product as Stripe.Product).name
        : null),
    defaultPriceId:
      product && "default_price" in product
        ? typeof product.default_price === "string"
          ? product.default_price
          : (product.default_price as Stripe.Price | undefined)?.id
        : null,
    priceName:
      (price.metadata?.price_name as string | undefined) ||
      price.nickname ||
      null,
    unitAmount: price.unit_amount,
    currency: price.currency,
    nickname: price.nickname,
    active: Boolean(price.active),
    type: price.recurring ? ("recurring" as const) : ("one_time" as const),
    interval: price.recurring?.interval,
    intervalCount: price.recurring?.interval_count ?? undefined,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">Edit Price</h1>
          <p className="text-muted-foreground">
            Update this price or replace it with new billing details.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/adminx/stripe/prices">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Prices
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link
              href={`https://dashboard.stripe.com/prices/${price.id}`}
              target="_blank"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View in Stripe
            </Link>
          </Button>
        </div>
      </div>

      <PriceEditForm price={editablePrice} />
    </div>
  );
}
