"use client";

import { ActionsMenu } from "@/components/admin/stripe/ActionsMenu";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

interface Coupon {
  id: string;
  name: string | null;
  percent_off: number | null;
  amount_off: number | null;
  currency: string | null;
  duration: string;
  duration_in_months: number | null;
  times_redeemed: number;
  max_redemptions: number | null;
  valid: boolean;
  redeem_by: number | null;
  created: number;
}

interface CouponTableProps {
  coupons: Coupon[];
}

export function CouponTable({ coupons: initialCoupons }: CouponTableProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [coupons] = useState(initialCoupons);

  const filteredCoupons = coupons.filter(
    (coupon) =>
      coupon.id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      coupon.name?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const formatDiscount = (coupon: Coupon) => {
    if (coupon.percent_off) {
      return `${coupon.percent_off}% off`;
    }
    if (coupon.amount_off && coupon.currency) {
      const amount = coupon.amount_off / 100;
      return `${coupon.currency.toUpperCase()} ${amount} off`;
    }
    return "N/A";
  };

  const formatDuration = (coupon: Coupon) => {
    if (coupon.duration === "once") return "One time";
    if (coupon.duration === "forever") return "Forever";
    if (coupon.duration === "repeating" && coupon.duration_in_months) {
      return `${coupon.duration_in_months} months`;
    }
    return coupon.duration;
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Coupon code copied!");
  };

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return "No expiration";
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder="Search coupons..."
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
                Duration
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
            {filteredCoupons.map((coupon) => (
              <tr
                key={coupon.id}
                className="border-b transition-colors hover:bg-muted/50 cursor-pointer"
                onClick={() =>
                  router.push(`/adminx/stripe/coupons/${coupon.id}`)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    router.push(`/adminx/stripe/coupons/${coupon.id}`);
                  }
                }}
                tabIndex={0}
              >
                <td className="p-4 align-middle">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-sm bg-muted px-2 py-1 rounded">
                      {coupon.id}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyCode(coupon.id);
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  {coupon.name && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {coupon.name}
                    </p>
                  )}
                </td>
                <td className="p-4 align-middle font-semibold">
                  {formatDiscount(coupon)}
                </td>
                <td className="p-4 align-middle text-sm">
                  {formatDuration(coupon)}
                </td>
                <td className="p-4 align-middle text-sm">
                  {coupon.times_redeemed}
                  {coupon.max_redemptions && ` / ${coupon.max_redemptions}`}
                </td>
                <td className="p-4 align-middle text-sm">
                  {formatDate(coupon.redeem_by)}
                </td>
                <td className="p-4 align-middle">
                  <Badge variant={coupon.valid ? "default" : "secondary"}>
                    {coupon.valid ? "Valid" : "Invalid"}
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
                    itemType="coupon"
                    itemId={coupon.id}
                    itemName={coupon.name || coupon.id}
                    viewUrl={`/adminx/stripe/coupons/${coupon.id}`}
                    stripeUrl={`https://dashboard.stripe.com/coupons/${coupon.id}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredCoupons.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No coupons found
          </div>
        )}
      </div>
    </div>
  );
}
