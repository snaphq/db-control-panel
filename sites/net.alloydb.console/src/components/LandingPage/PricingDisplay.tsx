"use client";

import type { PricingTier } from "@repo/billing/stripe/queries";
import { Button } from "@repo/react-ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/react-ui/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@repo/react-ui/components/ui/tabs";
import { cn } from "@repo/react-ui/lib/utils";
import { CheckCircle2, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

interface PricingDisplayProps {
  tiers: PricingTier[];
}

interface ReferralValidateResponse {
  valid: boolean;
  referrerFirstName?: string | null;
  refereeCreditCents?: number;
  currency?: string;
}

function ReferralBanner() {
  const searchParams = useSearchParams();
  const refCode = searchParams.get("ref");
  const [banner, setBanner] = useState<ReferralValidateResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!refCode) return;
    fetch(`/api/referral/validate/${encodeURIComponent(refCode)}`)
      .then((res) => {
        if (!res.ok) return null;
        return res.json() as Promise<ReferralValidateResponse>;
      })
      .then((data) => {
        if (data?.valid) setBanner(data);
      })
      .catch(() => {
        // Silently ignore — banner is non-critical
      });
  }, [refCode]);

  if (!refCode || !banner || dismissed) return null;

  const amount = banner.refereeCreditCents
    ? (banner.refereeCreditCents / 100).toFixed(2)
    : null;

  return (
    <div className="relative flex items-center justify-between gap-3 rounded-lg border border-green-500/40 bg-green-50 dark:bg-green-950/30 px-4 py-3 mb-6 text-sm text-green-800 dark:text-green-300">
      <span>
        {amount && (
          <>
            You'll get <strong>${amount}</strong> credit when you upgrade
          </>
        )}
        {banner.referrerFirstName && (
          <>
            {" "}
            — referred by <strong>{banner.referrerFirstName}</strong>
          </>
        )}
        {!amount &&
          !banner.referrerFirstName &&
          "You've been referred — enjoy your discount!"}
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

const PricingHeader = ({
  title,
  subtitle,
}: { title: string; subtitle: string }) => (
  <section className="text-center">
    <h2 className="text-5xl font-bold">{title}</h2>
    <p className="text-lg text-gray-400 pt-1">{subtitle}</p>
    <br />
  </section>
);

const PricingSwitch = ({ onSwitch }: { onSwitch: (value: string) => void }) => (
  <Tabs defaultValue="0" className="w-40 mx-auto" onValueChange={onSwitch}>
    <TabsList className="py-6 px-2">
      <TabsTrigger value="0" className="text-base">
        Monthly
      </TabsTrigger>
      <TabsTrigger value="1" className="text-base">
        Yearly
      </TabsTrigger>
    </TabsList>
  </Tabs>
);

const CheckItem = ({ text }: { text: string }) => (
  <div className="flex gap-2">
    <CheckCircle2 size={18} className="my-auto text-green-400" />
    <p className="pt-0.5 text-zinc-700 dark:text-zinc-300 text-sm">{text}</p>
  </div>
);

interface PricingCardProps {
  tier: PricingTier;
  isYearly: boolean;
}

const PricingCard = ({ tier, isYearly }: PricingCardProps) => {
  const {
    name,
    description,
    monthlyPrice,
    yearlyPrice,
    features,
    popular,
    exclusive,
    isContactPricing,
    actionLabel,
  } = tier;

  const displayPrice = isYearly ? yearlyPrice : monthlyPrice;
  const showSavings = isYearly && monthlyPrice && yearlyPrice;
  const savings = showSavings ? monthlyPrice * 12 - yearlyPrice : 0;

  return (
    <Card
      className={cn(
        `w-72 flex flex-col justify-between py-1 ${popular ? "border-rose-400" : "border-zinc-700"} mx-auto sm:mx-0`,
        {
          "animate-background-shine bg-white dark:bg-[linear-gradient(110deg,#000103,45%,#1e2631,55%,#000103)] [background-size:200%_100%] transition-colors":
            exclusive,
        },
      )}
    >
      <div>
        <CardHeader className="pb-8 pt-4">
          {showSavings && savings > 0 ? (
            <div className="flex justify-between">
              <CardTitle className="text-zinc-700 dark:text-zinc-300 text-lg">
                {name}
              </CardTitle>
              <div
                className={cn(
                  "px-2.5 rounded-xl h-fit text-sm py-1 bg-zinc-200 text-black dark:bg-zinc-800 dark:text-white",
                  {
                    "bg-linear-to-r from-orange-400 to-rose-400 dark:text-black":
                      popular,
                  },
                )}
              >
                Save ${savings}
              </div>
            </div>
          ) : (
            <CardTitle className="text-zinc-700 dark:text-zinc-300 text-lg">
              {name}
            </CardTitle>
          )}
          <div className="flex gap-0.5">
            <h3 className="text-3xl font-bold">
              {isContactPricing
                ? "Custom"
                : displayPrice != null
                  ? `$${displayPrice}`
                  : "Custom"}
            </h3>
            <span className="flex flex-col justify-end text-sm mb-1">
              {!isContactPricing && displayPrice != null
                ? isYearly
                  ? "/year"
                  : "/month"
                : null}
            </span>
          </div>
          <CardDescription className="pt-1.5 h-12">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {features.length > 0 ? (
            features.map((feature) => (
              <CheckItem key={feature} text={feature} />
            ))
          ) : (
            <>
              <CheckItem text="All features included" />
              <CheckItem text="Priority support" />
              <CheckItem text="Custom integrations" />
            </>
          )}
        </CardContent>
      </div>
      <CardFooter className="mt-2">
        <Button className="relative inline-flex w-full items-center justify-center rounded-md bg-black text-white dark:bg-white px-6 font-medium dark:text-black transition-colors focus:outline-hidden focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-50">
          <div className="absolute -inset-0.5 -z-10 rounded-lg bg-linear-to-b from-[#c7d2fe] to-[#8678f9] opacity-75 blur-sm" />
          {actionLabel}
        </Button>
      </CardFooter>
    </Card>
  );
};

export function PricingDisplay({ tiers }: PricingDisplayProps) {
  const [isYearly, setIsYearly] = useState<boolean>(false);

  const togglePricingPeriod = (value: string) =>
    setIsYearly(Number.parseInt(value) === 1);

  return (
    <div>
      <PricingHeader
        title="Pricing Plans"
        subtitle="Choose the plan that's right for you"
      />
      <Suspense>
        <ReferralBanner />
      </Suspense>
      <PricingSwitch onSwitch={togglePricingPeriod} />
      <section className="flex flex-col sm:flex-row sm:flex-wrap justify-center gap-8 mt-8">
        {tiers.map((tier) => (
          <PricingCard key={tier.id} tier={tier} isYearly={isYearly} />
        ))}
      </section>
    </div>
  );
}
