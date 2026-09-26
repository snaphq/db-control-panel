"use client";

import { getErrorMessage } from "@repo/core/error-utils";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

interface PromoCodeFormProps {
  coupons: Array<{
    id: string;
    name: string | null;
    percent_off: number | null;
    amount_off: number | null;
    currency: string | null;
  }>;
  promoCode?: {
    id: string;
    code?: string | null;
    active?: boolean | null;
    max_redemptions?: number | null;
    expires_at?: number | null;
    coupon?: { id: string } | null;
    restrictions?: {
      first_time_transaction?: boolean | null;
      minimum_amount?: number | null;
      minimum_amount_currency?: string | null;
    } | null;
  };
  mode?: "create" | "edit";
}

type PromoCodePayload = {
  code: string;
  coupon: string;
  active: boolean;
  max_redemptions?: number;
  expires_at?: number;
  restrictions?: {
    first_time_transaction?: boolean;
    minimum_amount?: number;
    minimum_amount_currency?: string;
  };
};

export function PromoCodeForm({
  coupons,
  promoCode,
  mode = "create",
}: PromoCodeFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const [code, setCode] = useState(promoCode?.code || "");
  const [couponId, setCouponId] = useState(promoCode?.coupon?.id || "");
  const [active, setActive] = useState(promoCode?.active ?? true);
  const [maxRedemptions, setMaxRedemptions] = useState(
    promoCode?.max_redemptions?.toString() || "",
  );
  const [expiresAt, setExpiresAt] = useState(() => {
    if (promoCode?.expires_at) {
      return new Date(promoCode.expires_at * 1000).toISOString().split("T")[0];
    }
    return "";
  });
  const [firstTimeTransaction, setFirstTimeTransaction] = useState(
    promoCode?.restrictions?.first_time_transaction || false,
  );
  const [minimumAmount, setMinimumAmount] = useState(
    promoCode?.restrictions?.minimum_amount
      ? (promoCode.restrictions.minimum_amount / 100).toString()
      : "",
  );
  const [minimumAmountCurrency, setMinimumAmountCurrency] = useState(
    promoCode?.restrictions?.minimum_amount_currency || "usd",
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code.trim()) {
      toast.error("Promo code is required");
      return;
    }

    if (!couponId) {
      toast.error("Please select a coupon");
      return;
    }

    setIsLoading(true);

    try {
      const promoCodeData: PromoCodePayload = {
        code: code.toUpperCase().trim(),
        coupon: couponId,
        active,
      };

      if (maxRedemptions) {
        promoCodeData.max_redemptions = Number.parseInt(maxRedemptions);
      }

      if (expiresAt) {
        promoCodeData.expires_at = Math.floor(
          new Date(expiresAt).getTime() / 1000,
        );
      }

      promoCodeData.restrictions = {};

      if (firstTimeTransaction) {
        promoCodeData.restrictions.first_time_transaction = true;
      }

      if (minimumAmount) {
        promoCodeData.restrictions.minimum_amount = Math.round(
          Number.parseFloat(minimumAmount) * 100,
        );
        promoCodeData.restrictions.minimum_amount_currency =
          minimumAmountCurrency;
      }

      const endpoint =
        mode === "create"
          ? "/api/admin/stripe/promo-codes"
          : `/api/admin/stripe/promo-codes/${promoCode?.id}`;

      const method = mode === "create" ? "POST" : "PUT";

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(promoCodeData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save promo code");
      }

      await response.json();

      toast.success(
        mode === "create"
          ? "Promo code created successfully!"
          : "Promo code updated successfully!",
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      router.push("/adminx/stripe/promo-codes");
      router.refresh();
    } catch (error: unknown) {
      console.error(error);
      toast.error(getErrorMessage(error, "Failed to save promo code"));
    } finally {
      setIsLoading(false);
    }
  };

  const formatCouponLabel = (coupon: PromoCodeFormProps["coupons"][number]) => {
    let discount = "Custom discount";

    if (coupon.percent_off !== null) {
      discount = `${coupon.percent_off}% off`;
    } else if (coupon.amount_off !== null && coupon.currency) {
      discount = `${coupon.currency.toUpperCase()} ${coupon.amount_off / 100} off`;
    }

    return coupon.name ? `${coupon.name} (${discount})` : discount;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Promo Code *</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="SUMMER2024"
              required
              maxLength={50}
              pattern="[A-Z0-9_-]+"
              disabled={mode === "edit"}
            />
            <p className="text-xs text-muted-foreground">
              Only uppercase letters, numbers, underscores, and hyphens allowed.
              {mode === "edit" && " Cannot be changed after creation."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="coupon">Coupon *</Label>
            <select
              id="coupon"
              value={couponId}
              onChange={(e) => setCouponId(e.target.value)}
              className="w-full p-2 border rounded h-10"
              required
              disabled={mode === "edit"}
            >
              <option value="">Select a coupon...</option>
              {coupons.map((coupon) => (
                <option key={coupon.id} value={coupon.id}>
                  {formatCouponLabel(coupon)}
                </option>
              ))}
            </select>
            {mode === "edit" && (
              <p className="text-xs text-muted-foreground">
                Cannot be changed after creation.
              </p>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="active"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="active" className="cursor-pointer">
              Active (promo code is available for use)
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="maxRedemptions">Max Redemptions (optional)</Label>
            <Input
              id="maxRedemptions"
              type="number"
              min="1"
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
              placeholder="Unlimited"
            />
            <p className="text-xs text-muted-foreground">
              Total number of times this code can be used
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expiresAt">Expiration Date (optional)</Label>
            <Input
              id="expiresAt"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
            />
            <p className="text-xs text-muted-foreground">
              Code will become inactive after this date
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="firstTimeTransaction"
              checked={firstTimeTransaction}
              onChange={(e) => setFirstTimeTransaction(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="firstTimeTransaction" className="cursor-pointer">
              First-time customers only
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Additional Restrictions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Minimum Purchase Amount (optional)</Label>
            <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
              <Input
                id="minimumAmount"
                type="number"
                step="0.01"
                min="0"
                value={minimumAmount}
                onChange={(e) => setMinimumAmount(e.target.value)}
                placeholder="0.00"
              />
              <select
                value={minimumAmountCurrency}
                onChange={(e) => setMinimumAmountCurrency(e.target.value)}
                className="w-full rounded border p-2 h-10"
              >
                <option value="usd">USD</option>
                <option value="eur">EUR</option>
                <option value="gbp">GBP</option>
                <option value="cad">CAD</option>
                <option value="aud">AUD</option>
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              Minimum order amount required to use this code
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "create" ? "Create Promo Code" : "Update Promo Code"}
        </Button>
      </div>
    </form>
  );
}
