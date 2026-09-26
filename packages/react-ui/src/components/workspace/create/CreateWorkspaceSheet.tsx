"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { PricingTier } from "@repo/billing/stripe/queries";
import { Elements } from "@stripe/react-stripe-js";
import { type Stripe, loadStripe } from "@stripe/stripe-js";
import { X } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { IncludedFeaturesRail } from "./IncludedFeaturesRail";
import { PaymentStep } from "./PaymentStep";
import { PlanBadge, type PlanBadgeKind } from "./PlanBadge";
import { type PlanChoice, PlanStep } from "./PlanStep";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pricingTiers: PricingTier[];
  canCreateFree: boolean;
  canUseTrial?: boolean;
}

type Step = "plan" | "payment";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  if (!PUBLISHABLE_KEY) return null;
  stripePromise ??= loadStripe(PUBLISHABLE_KEY);
  return stripePromise;
}

function pickProTier(tiers: PricingTier[]): PricingTier | null {
  const billable = tiers
    .filter((t) => !t.isContactPricing && (t.monthlyPriceId || t.yearlyPriceId))
    .sort((a, b) => a.displayOrder - b.displayOrder);
  return billable[0] ?? null;
}

function formatPrice(tier: PricingTier | null): string {
  if (!tier || tier.monthlyPrice == null) return "—";
  return `$${tier.monthlyPrice}/mo`;
}

function formatTrialCredit(tier: PricingTier | null): string | null {
  if (!tier || tier.monthlyPrice == null) return null;
  return `$${tier.monthlyPrice}`;
}

export function CreateWorkspaceSheet({
  open,
  onOpenChange,
  pricingTiers,
  canCreateFree,
  canUseTrial = true,
}: Props) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [step, setStep] = useState<Step>("plan");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState<PlanChoice>(
    canUseTrial ? "pro-trial" : "pro",
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [initializingPayment, setInitializingPayment] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const proTier = useMemo(() => pickProTier(pricingTiers), [pricingTiers]);
  const priceId = proTier?.monthlyPriceId ?? proTier?.yearlyPriceId ?? null;

  const badgeKind: PlanBadgeKind =
    plan === "free" ? "free" : plan === "pro-trial" ? "pro-trial" : "pro";

  useEffect(() => {
    if (!open) {
      setStep("plan");
      setName("");
      setSlug("");
      setPlan(canUseTrial ? "pro-trial" : "pro");
      setNameError(null);
      setClientSecret(null);
      setCustomerId(null);
      setSubmitting(false);
    }
  }, [open, canUseTrial]);

  async function handleContinue() {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Workspace name is required");
      return;
    }
    setNameError(null);

    if (plan === "free") {
      try {
        setSubmitting(true);
        const res = await fetch("/api/auth/organization", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed, slug }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data?.error ?? "Failed to create workspace");
          return;
        }
        toast.success("Workspace created");
        onOpenChange(false);
        router.push(`/dashboard/${slug}`);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!priceId) {
      toast.error("No pricing plan configured. Please contact support.");
      return;
    }
    if (!PUBLISHABLE_KEY) {
      toast.error("Stripe is not configured (missing publishable key).");
      return;
    }

    setInitializingPayment(true);
    try {
      const res = await fetch("/api/billing/setup-intent", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.clientSecret) {
        toast.error(data?.error ?? "Could not start payment");
        return;
      }
      setClientSecret(data.clientSecret);
      setCustomerId(data.customerId);
      setStep("payment");
    } finally {
      setInitializingPayment(false);
    }
  }

  async function handleConfirmed(paymentMethodId: string) {
    if (!customerId || !priceId) {
      throw new Error("Payment state is not ready");
    }
    const res = await fetch("/api/organizations/with-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        slug,
        priceId,
        customerId,
        paymentMethodId,
        withTrial: plan === "pro-trial",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error ?? "Failed to create workspace");
    }
    toast.success(plan === "pro-trial" ? "Trial started" : "Workspace created");
    onOpenChange(false);
    router.push(`/dashboard/${data.organization.slug}`);
  }

  const title = name.trim()
    ? `Create ${name.trim()} Workspace`
    : "Create a workspace";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200" />
        <Dialog.Content className="fixed right-3 top-3 bottom-3 z-50 flex w-[calc(100vw-24px)] max-w-[1152px] overflow-hidden rounded-xl border bg-background shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right-4 data-[state=open]:slide-in-from-right-4 duration-200 ease-out">
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <Dialog.Description className="sr-only">
            Unlock collaboration and improved deliverability.
          </Dialog.Description>
          <Dialog.Close className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Dialog.Close>
          <div className="grid h-full w-full grid-cols-1 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <div className="hidden md:block">
              <IncludedFeaturesRail />
            </div>

            <div className="flex h-full min-h-0 flex-col overflow-y-auto px-8 py-10">
              <div className="mx-auto flex w-full max-w-[440px] flex-col gap-6">
                <div className="flex flex-col items-center gap-3 text-center">
                  <PlanBadge kind={badgeKind} />
                  <h2 className="text-2xl font-normal tracking-tight">
                    {title}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Unlock collaboration and improved deliverability.
                  </p>
                </div>

                {step === "plan" && (
                  <PlanStep
                    name={name}
                    slug={slug}
                    onNameChange={setName}
                    onSlugChange={setSlug}
                    plan={plan}
                    onPlanChange={setPlan}
                    canCreateFree={canCreateFree}
                    canUseTrial={canUseTrial}
                    nameError={nameError}
                    onContinue={handleContinue}
                    onCancel={() => onOpenChange(false)}
                  />
                )}

                {step === "payment" && clientSecret && (
                  <Elements
                    stripe={getStripe()}
                    options={{
                      clientSecret,
                      appearance: {
                        theme: isDark ? "night" : "stripe",
                        variables: {
                          colorPrimary: "#0091FF",
                          colorBackground: isDark ? "#0a0a0a" : "#ffffff",
                          colorText: isDark ? "#fafafa" : "#0a0a0a",
                          colorTextSecondary: isDark ? "#a1a1aa" : "#71717a",
                          colorTextPlaceholder: isDark ? "#52525b" : "#a1a1aa",
                          colorDanger: "#ef4444",
                          colorIconTabSelected: "#0091FF",
                          borderRadius: "8px",
                          fontFamily:
                            "ui-sans-serif, system-ui, -apple-system, sans-serif",
                        },
                        rules: {
                          ".Input": {
                            border: isDark
                              ? "1px solid #27272a"
                              : "1px solid #e4e4e7",
                            backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
                            boxShadow: "none",
                          },
                          ".Input:focus": {
                            border: "1px solid #0091FF",
                            boxShadow: "0 0 0 1px #0091FF",
                          },
                          ".Tab": {
                            border: isDark
                              ? "1px solid #27272a"
                              : "1px solid #e4e4e7",
                            backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
                          },
                          ".Tab--selected": {
                            border: "1px solid #0091FF",
                            backgroundColor: isDark
                              ? "rgba(0, 145, 255, 0.12)"
                              : "rgba(0, 145, 255, 0.08)",
                          },
                          ".Label": {
                            color: isDark ? "#a1a1aa" : "#71717a",
                          },
                        },
                      },
                    }}
                    key={`${clientSecret}-${isDark ? "dark" : "light"}`}
                  >
                    <PaymentStep
                      workspaceName={name.trim()}
                      planLabel={proTier?.name ?? "Pro"}
                      planPrice={formatPrice(proTier)}
                      trialCredit={formatTrialCredit(proTier)}
                      withTrial={plan === "pro-trial"}
                      onBack={() => setStep("plan")}
                      onConfirmed={handleConfirmed}
                    />
                  </Elements>
                )}

                {(initializingPayment || submitting) && step === "plan" && (
                  <p className="text-center text-xs text-muted-foreground">
                    Preparing payment…
                  </p>
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
