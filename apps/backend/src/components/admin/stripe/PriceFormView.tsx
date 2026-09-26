"use client";

import { Button } from "@repo/react-ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/react-ui/components/ui/card";
import { Input } from "@repo/react-ui/components/ui/input";
import { Label } from "@repo/react-ui/components/ui/label";
import { Loader2, Plus, X } from "lucide-react";
import type { FormEvent } from "react";

export type BillingType = "recurring" | "one_time";
export type PricingModel = "flat" | "package" | "tiered" | "usage";
export type TierMode = "graduated" | "volume";
export type UsageAggregation =
  | "sum"
  | "last_during_period"
  | "max"
  | "last_ever";
export type IntervalUnit = "day" | "week" | "month" | "year";

export interface PriceTier {
  id: string;
  upTo: string;
  amount: string;
}

export interface IntervalPreset {
  label: string;
  value: string;
  interval: IntervalUnit;
  count: number;
}

interface PriceFormViewProps {
  productId: string;
  productName?: string;
  isLoading: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  priceName: string;
  onPriceNameChange: (value: string) => void;
  currency: string;
  onCurrencyChange: (value: string) => void;
  pricingModel: PricingModel;
  onPricingModelChange: (value: PricingModel) => void;
  unitAmount: string;
  onUnitAmountChange: (value: string) => void;
  packageUnitAmount: string;
  onPackageUnitAmountChange: (value: string) => void;
  usageAggregation: UsageAggregation;
  onUsageAggregationChange: (value: UsageAggregation) => void;
  usageMeter: string;
  onUsageMeterChange: (value: string) => void;
  tiersMode: TierMode;
  onTiersModeChange: (value: TierMode) => void;
  tiers: PriceTier[];
  onTierChange: (
    tierId: string,
    field: "upTo" | "amount",
    value: string,
  ) => void;
  onAddTier: () => void;
  onRemoveTier: (tierId: string) => void;
  billingType: BillingType;
  onBillingTypeChange: (value: BillingType) => void;
  intervalOption: string;
  onIntervalOptionChange: (value: string) => void;
  intervalPresets: IntervalPreset[];
  customIntervalValue: string;
  onCustomIntervalValueChange: (value: string) => void;
  customIntervalUnit: IntervalUnit;
  onCustomIntervalUnitChange: (value: IntervalUnit) => void;
  billingPeriodError: string | null;
  priceDescription: string;
  onPriceDescriptionChange: (value: string) => void;
  lookupKey: string;
  onLookupKeyChange: (value: string) => void;
  active: boolean;
  onActiveChange: (value: boolean) => void;
}

export function PriceFormView({
  productId,
  productName,
  isLoading,
  onSubmit,
  onCancel,
  priceName,
  onPriceNameChange,
  currency,
  onCurrencyChange,
  pricingModel,
  onPricingModelChange,
  unitAmount,
  onUnitAmountChange,
  packageUnitAmount,
  onPackageUnitAmountChange,
  usageAggregation,
  onUsageAggregationChange,
  usageMeter,
  onUsageMeterChange,
  tiersMode,
  onTiersModeChange,
  tiers,
  onTierChange,
  onAddTier,
  onRemoveTier,
  billingType,
  onBillingTypeChange,
  intervalOption,
  onIntervalOptionChange,
  intervalPresets,
  customIntervalValue,
  onCustomIntervalValueChange,
  customIntervalUnit,
  onCustomIntervalUnitChange,
  billingPeriodError,
  priceDescription,
  onPriceDescriptionChange,
  lookupKey,
  onLookupKeyChange,
  active,
  onActiveChange,
}: PriceFormViewProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Price Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {productName && (
            <div className="space-y-2">
              <Label>Product</Label>
              <div className="rounded border bg-muted/50 p-3">
                <p className="font-medium">{productName}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {productId}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="priceName">Price name *</Label>
            <Input
              id="priceName"
              value={priceName}
              onChange={(e) => onPriceNameChange(e.target.value)}
              placeholder="Pro plan monthly"
              required
            />
            <p className="text-xs text-muted-foreground">
              Internal label to help you identify this price in dashboards and
              integrations.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="currency">Currency *</Label>
              <select
                id="currency"
                value={currency}
                onChange={(e) => onCurrencyChange(e.target.value)}
                className="h-10 w-full rounded border p-2"
                required
              >
                <option value="usd">USD - US Dollar</option>
                <option value="eur">EUR - Euro</option>
                <option value="gbp">GBP - British Pound</option>
                <option value="cad">CAD - Canadian Dollar</option>
                <option value="aud">AUD - Australian Dollar</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pricingModel">Pricing model *</Label>
              <select
                id="pricingModel"
                value={pricingModel}
                onChange={(e) =>
                  onPricingModelChange(e.target.value as PricingModel)
                }
                className="h-10 w-full rounded border p-2"
              >
                <option value="flat">Flat rate</option>
                <option value="package">Package pricing</option>
                <option value="tiered">Tiered pricing</option>
                <option value="usage">Usage-based</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Determines how Stripe calculates charges for this price.
              </p>
            </div>
          </div>

          {pricingModel === "flat" && (
            <div className="space-y-2">
              <Label htmlFor="unitAmount">Amount *</Label>
              <Input
                id="unitAmount"
                type="number"
                min="0"
                step="0.01"
                value={unitAmount}
                onChange={(e) => onUnitAmountChange(e.target.value)}
                placeholder="9.99"
                required
              />
              <p className="text-xs text-muted-foreground">
                Charges a single flat fee per billing period.
              </p>
            </div>
          )}

          {pricingModel === "package" && (
            <div className="space-y-2">
              <Label htmlFor="packageUnitAmount">Price per unit *</Label>
              <Input
                id="packageUnitAmount"
                type="number"
                min="0"
                step="0.01"
                value={packageUnitAmount}
                onChange={(e) => onPackageUnitAmountChange(e.target.value)}
                placeholder="4.99"
                required
              />
              <p className="text-xs text-muted-foreground">
                Charge per seat, license, or package. Quantity is provided
                during checkout.
              </p>
            </div>
          )}

          {pricingModel === "usage" && (
            <div className="space-y-4 rounded border p-4">
              <div className="space-y-2">
                <Label htmlFor="usageAmount">Price per unit *</Label>
                <Input
                  id="usageAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitAmount}
                  onChange={(e) => onUnitAmountChange(e.target.value)}
                  placeholder="0.05"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Customers pay for the actual usage you report each cycle.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="usageAggregation">Aggregation method *</Label>
                <select
                  id="usageAggregation"
                  value={usageAggregation}
                  onChange={(e) =>
                    onUsageAggregationChange(e.target.value as UsageAggregation)
                  }
                  className="h-10 w-full rounded border p-2"
                >
                  <option value="sum">Sum usage during period</option>
                  <option value="last_during_period">
                    Last entry in period
                  </option>
                  <option value="max">Maximum value during period</option>
                  <option value="last_ever">Last reported value</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="usageMeter">Meter name (optional)</Label>
                <Input
                  id="usageMeter"
                  value={usageMeter}
                  onChange={(e) => onUsageMeterChange(e.target.value)}
                  placeholder="API calls"
                />
              </div>
            </div>
          )}

          {pricingModel === "tiered" && (
            <div className="space-y-4 rounded border p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tiersMode">Tier mode *</Label>
                  <select
                    id="tiersMode"
                    value={tiersMode}
                    onChange={(e) =>
                      onTiersModeChange(e.target.value as TierMode)
                    }
                    className="h-10 w-full rounded border p-2"
                  >
                    <option value="graduated">
                      Graduated (per tier pricing)
                    </option>
                    <option value="volume">
                      Volume (same rate for all units)
                    </option>
                  </select>
                </div>
              </div>
              <div className="space-y-3">
                {tiers.map((tier, index) => (
                  <div
                    key={tier.id}
                    className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"
                  >
                    <Input
                      value={tier.upTo}
                      onChange={(e) =>
                        onTierChange(tier.id, "upTo", e.target.value)
                      }
                      placeholder={
                        index === tiers.length - 1 ? "inf" : "Units up to…"
                      }
                    />
                    <Input
                      value={tier.amount}
                      onChange={(e) =>
                        onTierChange(tier.id, "amount", e.target.value)
                      }
                      placeholder="Price per unit"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveTier(tier.id)}
                      disabled={tiers.length === 1}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onAddTier}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add tier
                </Button>
                <p className="text-xs text-muted-foreground">
                  Set the final tier&apos;s limit to &quot;inf&quot; to cover
                  unlimited usage.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Billing type *</Label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  value="one_time"
                  checked={billingType === "one_time"}
                  onChange={() => onBillingTypeChange("one_time")}
                  className="h-4 w-4"
                />
                One-off
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  value="recurring"
                  checked={billingType === "recurring"}
                  onChange={() => onBillingTypeChange("recurring")}
                  className="h-4 w-4"
                />
                Recurring
              </label>
            </div>
          </div>

          {billingType === "recurring" && (
            <div className="space-y-2">
              <Label htmlFor="billingInterval">Billing period *</Label>
              <select
                id="billingInterval"
                value={intervalOption}
                onChange={(e) => onIntervalOptionChange(e.target.value)}
                className="h-10 w-full rounded border p-2"
              >
                {intervalPresets.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
              {intervalOption === "custom" && (
                <div className="grid gap-2 md:grid-cols-[1fr_1fr]">
                  <Input
                    type="number"
                    min="1"
                    value={customIntervalValue}
                    onChange={(e) =>
                      onCustomIntervalValueChange(e.target.value)
                    }
                  />
                  <select
                    value={customIntervalUnit}
                    onChange={(e) =>
                      onCustomIntervalUnitChange(e.target.value as IntervalUnit)
                    }
                    className="h-10 rounded border p-2"
                  >
                    <option value="day">Days</option>
                    <option value="week">Weeks</option>
                    <option value="month">Months</option>
                    <option value="year">Years</option>
                  </select>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Billing period must be between 1 day and 3 years.
              </p>
              {billingPeriodError && (
                <p className="text-xs text-destructive">{billingPeriodError}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Advanced settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="priceDescription">Price description</Label>
            <Input
              id="priceDescription"
              value={priceDescription}
              onChange={(e) => onPriceDescriptionChange(e.target.value)}
              placeholder="Shown on invoices, receipts, and Stripe dashboards"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lookupKey">Lookup key (optional)</Label>
            <Input
              id="lookupKey"
              value={lookupKey}
              onChange={(e) => onLookupKeyChange(e.target.value)}
              placeholder="pro_monthly"
            />
            <p className="text-xs text-muted-foreground">
              Use a lookup key to upgrade customers between prices
              programmatically.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="active"
              checked={active}
              onChange={(e) => onActiveChange(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="active" className="cursor-pointer">
              Active (price is available for purchase)
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Prices in Stripe are immutable. To change amount, currency, or
            billing, create a new price after saving.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Price
        </Button>
      </div>
    </form>
  );
}
