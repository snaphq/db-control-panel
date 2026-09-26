"use client";

import { ActionsMenu } from "@/components/admin/stripe/ActionsMenu";
import { Badge } from "@repo/ui/components/ui/badge";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface PriceRecord {
  id: string;
  active: boolean;
  unit_amount: number | null;
  currency: string;
  recurring: {
    interval: string;
    interval_count: number;
  } | null;
  nickname: string | null;
  product:
    | string
    | { id: string; name?: string; default_price?: string | { id: string } };
}

interface PriceTableProps {
  prices: PriceRecord[];
}

export function PriceTable({ prices }: PriceTableProps) {
  const router = useRouter();

  const formatAmount = (amount: number | null, currency: string) => {
    if (amount === null) return "Custom";
    const value = amount / 100;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(value);
  };

  const formatInterval = (recurring: PriceRecord["recurring"]) => {
    if (!recurring) return "One-time";
    const { interval, interval_count } = recurring;
    if (interval_count === 1) {
      return `Per ${interval}`;
    }
    return `Every ${interval_count} ${interval}s`;
  };

  return (
    <div className="rounded-md border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="h-12 px-4 text-left align-middle font-medium">
              Price
            </th>
            <th className="h-12 px-4 text-left align-middle font-medium">
              Billing
            </th>
            <th className="h-12 px-4 text-left align-middle font-medium">
              Product
            </th>
            <th className="h-12 px-4 text-left align-middle font-medium">
              Status
            </th>
            <th className="h-12 px-4 text-left align-middle font-medium">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {prices.map((price) => {
            const productId =
              typeof price.product === "string"
                ? price.product
                : price.product?.id;
            const productName =
              typeof price.product === "object"
                ? price.product?.name || productId
                : productId;

            return (
              <tr
                key={price.id}
                className="border-b transition-colors hover:bg-muted/50 cursor-pointer"
                onClick={() =>
                  router.push(`/adminx/stripe/prices/${price.id}/edit`)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    router.push(`/adminx/stripe/prices/${price.id}/edit`);
                  }
                }}
                tabIndex={0}
              >
                <td className="p-4 align-middle">
                  <div className="font-semibold">
                    {formatAmount(price.unit_amount, price.currency)}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {price.id}
                  </div>
                </td>
                <td className="p-4 align-middle">
                  <Badge variant="outline">
                    {formatInterval(price.recurring)}
                  </Badge>
                  {price.nickname && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {price.nickname}
                    </p>
                  )}
                </td>
                <td className="p-4 align-middle">
                  {productId ? (
                    <Link
                      href={`/adminx/stripe/products/${productId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary hover:underline"
                    >
                      {productName || productId}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-4 align-middle">
                  {price.active ? (
                    <Badge className="bg-emerald-500 text-white">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Archived</Badge>
                  )}
                </td>
                <td
                  className="p-4 align-middle"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                    }
                  }}
                >
                  <ActionsMenu
                    itemType="price"
                    itemId={price.id}
                    itemName={
                      price.nickname ||
                      `${formatAmount(price.unit_amount, price.currency)}`
                    }
                    viewUrl={`/adminx/stripe/prices/${price.id}/edit`}
                    stripeUrl={`https://dashboard.stripe.com/prices/${price.id}`}
                    isActive={price.active}
                    productId={productId || undefined}
                    defaultPriceId={
                      typeof price.product === "object"
                        ? typeof price.product.default_price === "string"
                          ? price.product.default_price
                          : price.product.default_price?.id
                        : undefined
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {prices.length === 0 && (
        <div className="p-8 text-center text-muted-foreground">
          No prices found
        </div>
      )}
    </div>
  );
}
