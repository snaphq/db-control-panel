"use client";

import { ActionsMenu } from "@/components/admin/stripe/ActionsMenu";
import { Badge } from "@repo/ui/components/ui/badge";
import Link from "next/link";

interface Price {
  id: string;
  active: boolean;
  currency: string;
  unit_amount: number | null;
  type: string;
  recurring: {
    interval: string;
    interval_count: number;
  } | null;
  nickname: string | null;
}

interface PriceListProps {
  prices: Price[];
  productId: string;
  defaultPriceId?: string | null;
}

export function PriceList({
  prices,
  productId,
  defaultPriceId,
}: PriceListProps) {
  const formatAmount = (amount: number | null, currency: string) => {
    if (amount === null) return "Custom";
    const value = amount / 100;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(value);
  };

  const formatInterval = (recurring: Price["recurring"]) => {
    if (!recurring) return "One-time";
    const { interval, interval_count } = recurring;
    if (interval_count === 1) {
      return `Per ${interval}`;
    }
    return `Every ${interval_count} ${interval}s`;
  };

  if (prices.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No prices configured for this product.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {prices.map((price) => (
        <Link
          key={price.id}
          href={`/stripe/prices/${price.id}/edit`}
          className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition cursor-pointer"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold">
                {formatAmount(price.unit_amount, price.currency)}
              </span>
              <Badge variant="outline">{formatInterval(price.recurring)}</Badge>
              {price.active ? (
                <Badge className="bg-emerald-500 text-white">Active</Badge>
              ) : (
                <Badge variant="secondary">Archived</Badge>
              )}
              {defaultPriceId === price.id && (
                <Badge
                  variant="outline"
                  className="border-primary text-primary"
                >
                  Default
                </Badge>
              )}
            </div>
            {price.nickname && (
              <p className="text-sm text-muted-foreground mt-1">
                {price.nickname}
              </p>
            )}
            <p className="text-xs text-muted-foreground font-mono mt-1">
              {price.id}
            </p>
          </div>
          <ActionsMenu
            itemType="price"
            itemId={price.id}
            itemName={
              price.nickname ||
              `${formatAmount(price.unit_amount, price.currency)} ${formatInterval(price.recurring)}`
            }
            viewUrl={`/stripe/prices/${price.id}/edit`}
            stripeUrl={`https://dashboard.stripe.com/prices/${price.id}`}
            isActive={price.active}
            productId={productId}
            defaultPriceId={defaultPriceId ?? undefined}
          />
        </Link>
      ))}
    </div>
  );
}
