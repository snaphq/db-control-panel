"use client";

import { ActionsMenu } from "@/components/admin/stripe/ActionsMenu";
import { Badge } from "@repo/react-ui/components/ui/badge";
import { Input } from "@repo/react-ui/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface PromoCode {
  id: string;
  code: string;
  active: boolean;
  percent_off: number | null;
  amount_off: number | null;
  coupon_currency: string | null;
  coupon_name: string | null;
  times_redeemed: number;
  max_redemptions: number | null;
  expires_at: number | null;
  coupon?: string | { id: string; name?: string };
}

interface PromoCodeTableProps {
  promoCodes: PromoCode[];
}

export function PromoCodeTable({
  promoCodes: initialPromoCodes,
}: PromoCodeTableProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [promoCodes] = useState(initialPromoCodes);

  const filteredPromoCodes = promoCodes.filter(
    (promo) =>
      promo.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      promo.coupon_name?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return "No expiration";
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  const formatDiscount = (promo: PromoCode) => {
    // Check local properties first
    if (promo.percent_off) {
      return `${promo.percent_off}% off`;
    }
    if (promo.amount_off && promo.coupon_currency) {
      const amount = promo.amount_off / 100;
      return `${promo.coupon_currency.toUpperCase()} ${amount} off`;
    }

    // Fallback to coupon object if available
    if (typeof promo.coupon === "object" && promo.coupon !== null) {
      const coupon = promo.coupon as unknown as {
        percent_off?: number;
        amount_off?: number;
        currency?: string;
      };
      if (coupon.percent_off) {
        return `${coupon.percent_off}% off`;
      }
      if (coupon.amount_off && coupon.currency) {
        const amount = coupon.amount_off / 100;
        return `${coupon.currency.toUpperCase()} ${amount} off`;
      }
    }

    return "N/A";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder="Search promo codes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="h-12 px-4 text-left align-middle font-medium">
                Code
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Discount
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Coupon
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Redemptions
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Expires
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
            {filteredPromoCodes.map((promo) => {
              const couponId =
                typeof promo.coupon === "string"
                  ? promo.coupon
                  : promo.coupon?.id;
              return (
                <tr
                  key={promo.id}
                  className="border-b transition-colors hover:bg-muted/50 cursor-pointer"
                  onClick={() => router.push(`/stripe/promo-codes/${promo.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      router.push(`/stripe/promo-codes/${promo.id}`);
                    }
                  }}
                  tabIndex={0}
                >
                  <td className="p-4 align-middle">
                    <code className="font-mono text-sm bg-muted px-2 py-1 rounded">
                      {promo.code}
                    </code>
                    {promo.coupon_name && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {promo.coupon_name}
                      </p>
                    )}
                  </td>
                  <td className="p-4 align-middle font-semibold">
                    {formatDiscount(promo)}
                  </td>
                  <td className="p-4 align-middle text-sm">
                    {couponId ? (
                      <Link
                        href={`/stripe/coupons/${couponId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary hover:underline"
                      >
                        {promo.coupon_name || couponId}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-4 align-middle text-sm">
                    {promo.times_redeemed || 0}
                    {promo.max_redemptions && ` / ${promo.max_redemptions}`}
                  </td>
                  <td className="p-4 align-middle text-sm">
                    {formatDate(promo.expires_at)}
                  </td>
                  <td className="p-4 align-middle">
                    <Badge variant={promo.active ? "default" : "secondary"}>
                      {promo.active ? "Active" : "Inactive"}
                    </Badge>
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
                      itemType="promo-code"
                      itemId={promo.id}
                      itemName={promo.code}
                      viewUrl={`/stripe/promo-codes/${promo.id}`}
                      stripeUrl={`https://dashboard.stripe.com/promotion_codes/${promo.id}`}
                      isActive={promo.active}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredPromoCodes.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No promo codes found
          </div>
        )}
      </div>
    </div>
  );
}
