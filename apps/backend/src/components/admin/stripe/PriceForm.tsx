"use client";

import {
  type BillingType,
  type IntervalPreset,
  type IntervalUnit,
  PriceFormView,
  type PriceTier,
  type PricingModel,
  type TierMode,
  type UsageAggregation,
} from "@/components/admin/stripe/PriceFormView";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

interface PriceFormProps {
  productId: string;
  productName?: string;
}

const intervalPresets: IntervalPreset[] = [
  { label: "Daily", value: "day", interval: "day", count: 1 },
  { label: "Weekly", value: "week", interval: "week", count: 1 },
  { label: "Monthly", value: "month", interval: "month", count: 1 },
  { label: "Every 3 months", value: "quarterly", interval: "month", count: 3 },
  { label: "Every 6 months", value: "biannual", interval: "month", count: 6 },
  { label: "Yearly", value: "year", interval: "year", count: 1 },
  { label: "Custom", value: "custom", interval: "month", count: 1 },
];

interface CreatePricePayload {
  product: string;
  currency: string;
  nickname?: string;
  lookup_key?: string;
  active: boolean;
  name: string;
  pricing_model: PricingModel;
  billing_type?: BillingType;
  interval?: IntervalUnit;
  interval_count?: number;
  unit_amount?: number;
  tiers_mode?: TierMode;
  tiers?: Array<{ up_to: number | "inf"; unit_amount: number }>;
  usage_type?: "metered";
  aggregate_usage?: UsageAggregation;
  usage_meter?: string;
}

const createTierId = () => Math.random().toString(36).slice(2, 10);

export function PriceForm({ productId, productName }: PriceFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const [priceName, setPriceName] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [billingType, setBillingType] = useState<BillingType>("recurring");
  const [pricingModel, setPricingModel] = useState<PricingModel>("flat");

  const [unitAmount, setUnitAmount] = useState("");
  const [packageUnitAmount, setPackageUnitAmount] = useState("");
  const [tiersMode, setTiersMode] = useState<TierMode>("graduated");
  const [tiers, setTiers] = useState<PriceTier[]>([
    { id: createTierId(), upTo: "10", amount: "" },
  ]);
  const [usageAggregation, setUsageAggregation] =
    useState<UsageAggregation>("sum");
  const [usageMeter, setUsageMeter] = useState("");

  const [intervalOption, setIntervalOption] = useState("month");
  const [customIntervalValue, setCustomIntervalValue] = useState("3");
  const [customIntervalUnit, setCustomIntervalUnit] =
    useState<IntervalUnit>("month");
  const [priceDescription, setPriceDescription] = useState("");
  const [lookupKey, setLookupKey] = useState("");
  const [active, setActive] = useState(true);

  const [billingPeriodError, setBillingPeriodError] = useState<string | null>(
    null,
  );

  const MAX_BILLING_DAYS = 365 * 3;
  const intervalToDays: Record<IntervalUnit, number> = {
    day: 1,
    week: 7,
    month: 30,
    year: 365,
  };

  useEffect(() => {
    if (billingType !== "recurring") {
      setBillingPeriodError(null);
      return;
    }

    let count = 1;
    let unit: IntervalUnit = "month";

    if (intervalOption === "custom") {
      count = Number(customIntervalValue);
      unit = customIntervalUnit;
    } else {
      const preset = intervalPresets.find(
        (option) => option.value === intervalOption,
      );
      if (preset) {
        count = preset.count;
        unit = preset.interval;
      }
    }

    if (!Number.isFinite(count) || count < 1) {
      setBillingPeriodError(
        "Billing period must be between 1 day and 3 years.",
      );
      return;
    }

    const totalDays = count * intervalToDays[unit];
    if (totalDays < 1 || totalDays > MAX_BILLING_DAYS) {
      setBillingPeriodError(
        "Billing period must be between 1 day and 3 years.",
      );
      return;
    }

    setBillingPeriodError(null);
  }, [billingType, intervalOption, customIntervalValue, customIntervalUnit]);

  const handleTierChange = (
    tierId: string,
    field: "upTo" | "amount",
    value: string,
  ) => {
    setTiers((prev) =>
      prev.map((tier) =>
        tier.id === tierId ? { ...tier, [field]: value } : tier,
      ),
    );
  };

  const handleAddTier = () => {
    setTiers((prev) => [
      ...prev,
      { id: createTierId(), upTo: "inf", amount: "" },
    ]);
  };

  const handleRemoveTier = (tierId: string) => {
    setTiers((prev) =>
      prev.length === 1 ? prev : prev.filter((tier) => tier.id !== tierId),
    );
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (!priceName.trim()) {
        throw new Error("Name is required.");
      }

      if (billingType === "recurring" && billingPeriodError) {
        throw new Error(billingPeriodError);
      }

      if (pricingModel === "usage" && billingType !== "recurring") {
        throw new Error("Usage-based pricing requires recurring billing.");
      }

      const payload: CreatePricePayload = {
        product: productId,
        currency,
        nickname: priceDescription || undefined,
        lookup_key: lookupKey || undefined,
        active,
        name: priceName.trim(),
        pricing_model: pricingModel,
      };

      if (billingType === "recurring") {
        let interval: IntervalUnit = "month";
        let intervalCount = 1;

        if (intervalOption === "custom") {
          interval = customIntervalUnit;
          intervalCount = Number(customIntervalValue) || 1;
        } else {
          const preset = intervalPresets.find(
            (option) => option.value === intervalOption,
          );
          if (preset) {
            interval = preset.interval;
            intervalCount = preset.count;
          }
        }

        payload.billing_type = "recurring";
        payload.interval = interval;
        payload.interval_count = intervalCount;
      } else {
        payload.billing_type = "one_time";
      }

      if (pricingModel === "flat") {
        const parsedAmount = Number.parseFloat(unitAmount);
        const amountInCents = Math.round(parsedAmount * 100);
        if (!Number.isFinite(parsedAmount) || amountInCents <= 0) {
          throw new Error("Enter a valid price amount greater than 0.");
        }
        payload.unit_amount = amountInCents;
      } else if (pricingModel === "package") {
        const parsedAmount = Number.parseFloat(packageUnitAmount);
        const amountInCents = Math.round(parsedAmount * 100);
        if (!Number.isFinite(parsedAmount) || amountInCents <= 0) {
          throw new Error("Enter a valid price per unit greater than 0.");
        }
        payload.unit_amount = amountInCents;
      } else if (pricingModel === "tiered") {
        payload.tiers_mode = tiersMode;

        const parsedTiers = tiers.map((tier, index) => {
          const amount = Math.round(
            Number.parseFloat(tier.amount || "0") * 100,
          );
          if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error("Enter valid tier amounts.");
          }

          const upToRaw =
            index === tiers.length - 1
              ? "inf"
              : Number(tier.upTo || "0") || "inf";
          const upTo: number | "inf" =
            upToRaw === "inf" ? "inf" : Math.max(1, Number(upToRaw));

          return {
            up_to: upTo,
            unit_amount: amount,
          };
        });

        payload.tiers = parsedTiers;
      } else if (pricingModel === "usage") {
        const parsedAmount = Number.parseFloat(unitAmount);
        const amountInCents = Math.round(parsedAmount * 100);
        if (!Number.isFinite(parsedAmount) || amountInCents <= 0) {
          throw new Error("Enter a valid price amount greater than 0.");
        }

        payload.unit_amount = amountInCents;
        payload.usage_type = "metered";
        payload.aggregate_usage = usageAggregation;
        payload.usage_meter = usageMeter || undefined;
      }

      const response = await fetch("/api/admin/stripe/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create price");
      }

      toast.success("Price created successfully!");

      await new Promise((resolve) => setTimeout(resolve, 1000));

      router.push(`/stripe/products/${productId}`);
      router.refresh();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to create price";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PriceFormView
      productId={productId}
      productName={productName}
      isLoading={isLoading}
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
      priceName={priceName}
      onPriceNameChange={setPriceName}
      currency={currency}
      onCurrencyChange={setCurrency}
      pricingModel={pricingModel}
      onPricingModelChange={setPricingModel}
      unitAmount={unitAmount}
      onUnitAmountChange={setUnitAmount}
      packageUnitAmount={packageUnitAmount}
      onPackageUnitAmountChange={setPackageUnitAmount}
      usageAggregation={usageAggregation}
      onUsageAggregationChange={setUsageAggregation}
      usageMeter={usageMeter}
      onUsageMeterChange={setUsageMeter}
      tiersMode={tiersMode}
      onTiersModeChange={setTiersMode}
      tiers={tiers}
      onTierChange={handleTierChange}
      onAddTier={handleAddTier}
      onRemoveTier={handleRemoveTier}
      billingType={billingType}
      onBillingTypeChange={setBillingType}
      intervalOption={intervalOption}
      onIntervalOptionChange={setIntervalOption}
      intervalPresets={intervalPresets}
      customIntervalValue={customIntervalValue}
      onCustomIntervalValueChange={setCustomIntervalValue}
      customIntervalUnit={customIntervalUnit}
      onCustomIntervalUnitChange={setCustomIntervalUnit}
      billingPeriodError={billingPeriodError}
      priceDescription={priceDescription}
      onPriceDescriptionChange={setPriceDescription}
      lookupKey={lookupKey}
      onLookupKeyChange={setLookupKey}
      active={active}
      onActiveChange={setActive}
    />
  );
}
