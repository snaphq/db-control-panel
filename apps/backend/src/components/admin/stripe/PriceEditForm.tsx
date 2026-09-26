"use client";

import { getErrorMessage } from "@repo/core/error-utils";
import { Button } from "@repo/react-ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/react-ui/components/ui/card";
import { Input } from "@repo/react-ui/components/ui/input";
import { Label } from "@repo/react-ui/components/ui/label";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const MAX_BILLING_DAYS = 365 * 3;
const intervalToDays: Record<"day" | "week" | "month" | "year", number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

interface EditablePrice {
  id: string;
  productId: string;
  productName?: string | null;
  defaultPriceId?: string | null;
  priceName?: string | null;
  unitAmount: number | null;
  currency: string;
  nickname?: string | null;
  active: boolean;
  type: "one_time" | "recurring";
  interval?: "day" | "week" | "month" | "year";
  intervalCount?: number;
}

interface PriceEditFormProps {
  price: EditablePrice;
}

export function PriceEditForm({ price }: PriceEditFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [priceName, setPriceName] = useState(price.priceName || "");
  const [unitAmount, setUnitAmount] = useState(
    price.unitAmount !== null ? (price.unitAmount / 100).toString() : "",
  );
  const [currency, setCurrency] = useState(price.currency.toLowerCase());
  const [type, setType] = useState<"one_time" | "recurring">(price.type);
  const [interval, setInterval] = useState<"day" | "week" | "month" | "year">(
    price.interval || "month",
  );
  const [intervalCount, setIntervalCount] = useState(
    (price.intervalCount ?? 1).toString(),
  );
  const [nickname, setNickname] = useState(price.nickname || "");
  const [active, setActive] = useState(price.active);
  const [setAsDefault, setSetAsDefault] = useState(
    price.defaultPriceId === price.id,
  );
  const [billingPeriodError, setBillingPeriodError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (type !== "recurring") {
      setBillingPeriodError(null);
      return;
    }
    const count = Number(intervalCount);
    if (!Number.isFinite(count) || count < 1) {
      setBillingPeriodError(
        "Billing period must be between 1 day and 3 years.",
      );
      return;
    }
    const totalDays = count * intervalToDays[interval];
    if (totalDays < 1 || totalDays > MAX_BILLING_DAYS) {
      setBillingPeriodError(
        "Billing period must be between 1 day and 3 years.",
      );
      return;
    }
    setBillingPeriodError(null);
  }, [type, interval, intervalCount]);

  const originalValues = useMemo(() => {
    return {
      unitAmount: price.unitAmount,
      currency: price.currency.toLowerCase(),
      type: price.type,
      interval: price.interval || "month",
      intervalCount: price.intervalCount ?? 1,
    };
  }, [price]);

  const parsedCurrentAmount = useMemo(() => {
    const parsed = Number.parseFloat(unitAmount);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return Math.round(parsed * 100);
  }, [unitAmount]);

  const requiresReplacement = useMemo(() => {
    if (parsedCurrentAmount === null || originalValues.unitAmount === null) {
      return true;
    }
    if (parsedCurrentAmount !== originalValues.unitAmount) {
      return true;
    }
    if (currency !== originalValues.currency) {
      return true;
    }
    if (type !== originalValues.type) {
      return true;
    }
    if (type === "recurring") {
      const currentCount = Number(intervalCount) || 1;
      if (
        interval !== originalValues.interval ||
        currentCount !== originalValues.intervalCount
      ) {
        return true;
      }
    }
    return false;
  }, [
    parsedCurrentAmount,
    originalValues,
    currency,
    type,
    interval,
    intervalCount,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!price.productId) {
      toast.error("Price is not associated with a product.");
      return;
    }
    if (!priceName.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (type === "recurring" && billingPeriodError) {
      toast.error(billingPeriodError);
      return;
    }
    if (!parsedCurrentAmount || parsedCurrentAmount <= 0) {
      toast.error("Enter a valid price amount greater than 0.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        nickname: nickname || undefined,
        active,
        productId: price.productId,
        setAsDefault,
        name: priceName.trim(),
      };

      if (requiresReplacement) {
        payload.mode = "replace";
        payload.unitAmount = parsedCurrentAmount;
        payload.currency = currency;
        payload.billingType = type;
        if (type === "recurring") {
          payload.interval = interval;
          payload.intervalCount = Number(intervalCount) || 1;
        }
      } else {
        payload.mode = "basic";
      }

      const response = await fetch(`/api/admin/stripe/prices/${price.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to update price");
      }

      if (result.status === "replaced" && result.price?.id) {
        toast.success("Price updated. Created a new price for this product.");
        await new Promise((resolve) => setTimeout(resolve, 600));
        router.push(`/stripe/prices/${result.price.id}/edit`);
        router.refresh();
        return;
      }

      toast.success("Price updated successfully!");
      await new Promise((resolve) => setTimeout(resolve, 400));
      router.refresh();
    } catch (error: unknown) {
      console.error(error);
      toast.error(getErrorMessage(error, "Failed to update price"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Edit Price</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="priceName">Price name *</Label>
            <Input
              id="priceName"
              value={priceName}
              onChange={(e) => setPriceName(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Internal label for this price. Used for dashboards and metadata.
            </p>
          </div>
          {price.productName && (
            <div className="space-y-2">
              <Label>Product</Label>
              <div className="p-3 rounded border bg-muted/50">
                <p className="font-medium">{price.productName}</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {price.productId}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={unitAmount}
                onChange={(e) => setUnitAmount(e.target.value)}
                placeholder="9.99"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency *</Label>
              <select
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full p-2 border rounded h-10"
                required
              >
                <option value="usd">USD - US Dollar</option>
                <option value="eur">EUR - Euro</option>
                <option value="gbp">GBP - British Pound</option>
                <option value="cad">CAD - Canadian Dollar</option>
                <option value="aud">AUD - Australian Dollar</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Billing Type *</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="one_time"
                  checked={type === "one_time"}
                  onChange={() => setType("one_time")}
                  className="h-4 w-4"
                />
                One-time
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="recurring"
                  checked={type === "recurring"}
                  onChange={() => setType("recurring")}
                  className="h-4 w-4"
                />
                Recurring
              </label>
            </div>
          </div>

          {type === "recurring" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="interval">Billing Interval *</Label>
                  <select
                    id="interval"
                    value={interval}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      if (
                        nextValue === "day" ||
                        nextValue === "week" ||
                        nextValue === "month" ||
                        nextValue === "year"
                      ) {
                        setInterval(nextValue);
                      }
                    }}
                    className="w-full p-2 border rounded h-10"
                    required
                  >
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="intervalCount">Interval Count *</Label>
                  <Input
                    id="intervalCount"
                    type="number"
                    min="1"
                    value={intervalCount}
                    onChange={(e) => setIntervalCount(e.target.value)}
                    required
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Billing period must be between 1 day and 3 years.
              </p>
              {billingPeriodError && (
                <p className="text-xs text-destructive">{billingPeriodError}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="nickname">Price description (optional)</Label>
            <Input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Shown on invoices and dashboards"
            />
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
              Active (price available for new purchases)
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="defaultPrice"
              checked={setAsDefault}
              onChange={(e) => setSetAsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="defaultPrice" className="cursor-pointer">
              Set as product default price
            </Label>
          </div>

          {requiresReplacement && (
            <p className="text-xs text-muted-foreground">
              Updating the amount, currency, or billing settings will create a
              new price and archive this one automatically.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </div>
    </form>
  );
}
