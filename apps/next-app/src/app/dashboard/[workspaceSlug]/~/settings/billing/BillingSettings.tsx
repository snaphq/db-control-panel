"use client";

import { ANALYTICS_EVENTS } from "@repo/analytics/client";
import { useTrackEvent } from "@repo/analytics/client";
import type { PricingTier } from "@repo/billing/types";
import type {
  BillingSubscriptionResponse,
  BillingUsageResponse,
} from "@repo/billing/types";
import { Alert, AlertDescription } from "@repo/ui/components/ui/alert";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Progress } from "@repo/ui/components/ui/progress";
import {
  AlertCircle,
  Check,
  CheckCircle,
  CreditCard,
  ExternalLink,
  FolderKanban,
  Loader2,
  Users,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Separator } from "@repo/ui/components/ui/separator";
import {
  BillingDetailsForm,
  type BillingDetailsInitial,
} from "./BillingDetailsForm";

interface BillingSettingsProps {
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  subscription: BillingSubscriptionResponse;
  usage: BillingUsageResponse;
  pricingTiers: PricingTier[];
  canManageBilling: boolean;
  enterpriseContactLink: string;
  billingDetails: BillingDetailsInitial;
}

export function BillingSettings({
  organizationId,
  organizationSlug,
  organizationName,
  subscription,
  usage,
  pricingTiers,
  canManageBilling,
  enterpriseContactLink,
  billingDetails,
}: BillingSettingsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    "monthly",
  );
  const trackEvent = useTrackEvent();

  const checkoutSuccess = searchParams.get("checkout") === "success";
  const checkoutCancelled = searchParams.get("checkout") === "cancelled";

  // Track when user views pricing page
  useEffect(() => {
    trackEvent(ANALYTICS_EVENTS.USER_CHECKED_PRICING, {
      source_page: "billing_settings",
      current_plan: subscription.plan?.productName || "free",
      viewed_plans: pricingTiers.map((tier) => tier.name),
    });
  }, [trackEvent, subscription.plan?.productName, pricingTiers]);

  const handleManageBilling = async () => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/portal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId }),
        });

        const data = await res.json();

        if (!res.ok) {
          toast.error(data.error || "Failed to open billing portal");
          return;
        }

        window.location.href = data.portalUrl;
      } catch (error) {
        console.error("Error opening billing portal:", error);
        toast.error("Failed to open billing portal");
      }
    });
  };

  const handleUpgrade = async (priceId: string) => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            priceId,
            type: "upgrade",
            withTrial: false,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          toast.error(data.error || "Failed to create checkout session");
          return;
        }

        window.location.href = data.checkoutUrl;
      } catch (error) {
        console.error("Error creating checkout:", error);
        toast.error("Failed to start upgrade");
      }
    });
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getStatusBadge = () => {
    if (subscription.isReadOnly) {
      return <Badge variant="destructive">Read Only</Badge>;
    }
    if (subscription.isTrialing) {
      return <Badge variant="secondary">Trial</Badge>;
    }
    if (subscription.plan?.status === "past_due") {
      return <Badge variant="destructive">Past Due</Badge>;
    }
    if (subscription.plan?.status === "active") {
      return <Badge className="bg-emerald-500">Active</Badge>;
    }
    if (subscription.isFree) {
      return <Badge variant="outline">Free</Badge>;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Success/Cancel Alerts */}
      {checkoutSuccess && (
        <Alert className="border-emerald-500 bg-emerald-50 dark:bg-emerald-950">
          <CheckCircle className="h-4 w-4 text-emerald-500" />
          <AlertDescription className="text-emerald-700 dark:text-emerald-300">
            Your subscription has been updated successfully!
          </AlertDescription>
        </Alert>
      )}
      {checkoutCancelled && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Checkout was cancelled. Your subscription remains unchanged.
          </AlertDescription>
        </Alert>
      )}

      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Current Plan
              </CardTitle>
              <CardDescription>
                Your workspace subscription and billing details
              </CardDescription>
            </div>
            {getStatusBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {subscription.isFree ? (
            <div>
              <h3 className="text-2xl font-bold">Free Plan</h3>
              <p className="text-muted-foreground">
                Basic features for personal use
              </p>
            </div>
          ) : subscription.plan ? (
            <div className="space-y-2">
              <h3 className="text-2xl font-bold">
                {subscription.plan.productName}
              </h3>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">
                  ${(subscription.plan.amount / 100).toFixed(0)}
                </span>
                <span className="text-muted-foreground">
                  /{subscription.plan.interval}
                </span>
              </div>
              {subscription.isTrialing && subscription.trialEndsAt && (
                <p className="text-sm text-amber-600">
                  Trial ends on {formatDate(subscription.trialEndsAt)}
                </p>
              )}
              {subscription.plan.cancelAtPeriodEnd && (
                <p className="text-sm text-destructive">
                  Cancels on{" "}
                  {formatDate(subscription.plan.currentPeriodEnd.toString())}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Current period:{" "}
                {formatDate(subscription.plan.currentPeriodStart.toString())} -{" "}
                {formatDate(subscription.plan.currentPeriodEnd.toString())}
              </p>
            </div>
          ) : null}
        </CardContent>
        {canManageBilling && !subscription.isFree && (
          <CardFooter>
            <Button onClick={handleManageBilling} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <ExternalLink className="h-4 w-4 mr-2" />
              Manage Billing
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* Usage Card */}
      <Card>
        <CardHeader>
          <CardTitle>Usage</CardTitle>
          <CardDescription>
            Current resource usage for this workspace
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Members Usage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Team Members</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {usage.usage.members.current} /{" "}
                {usage.usage.members.limit === "unlimited"
                  ? "Unlimited"
                  : usage.usage.members.limit}
              </span>
            </div>
            {usage.usage.members.limit !== "unlimited" && (
              <Progress
                value={usage.usage.members.percentage}
                className="h-2"
              />
            )}
          </div>

          {/* Projects Usage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Projects</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {usage.usage.projects.current} /{" "}
                {usage.usage.projects.limit === "unlimited"
                  ? "Unlimited"
                  : usage.usage.projects.limit}
              </span>
            </div>
            {usage.usage.projects.limit !== "unlimited" && (
              <Progress
                value={usage.usage.projects.percentage}
                className="h-2"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Upgrade Section (only for free or if there are higher tiers) */}
      {(subscription.isFree || subscription.isTrialing) && canManageBilling && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Upgrade Your Plan</h2>
            <div className="flex items-center gap-2 bg-muted p-1 rounded-lg">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  billingCycle === "monthly"
                    ? "bg-background shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setBillingCycle("monthly")}
              >
                Monthly
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  billingCycle === "yearly"
                    ? "bg-background shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setBillingCycle("yearly")}
              >
                Yearly
                <Badge variant="secondary" className="ml-2 text-xs">
                  Save 20%
                </Badge>
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pricingTiers.map((tier) => {
              const price =
                billingCycle === "yearly"
                  ? tier.yearlyPrice
                  : tier.monthlyPrice;
              const priceId =
                billingCycle === "yearly"
                  ? tier.yearlyPriceId
                  : tier.monthlyPriceId;
              const isCurrentPlan = subscription.plan?.productId === tier.id;

              if (tier.isContactPricing) {
                return (
                  <Card key={tier.id}>
                    <CardHeader>
                      <CardTitle>{tier.name}</CardTitle>
                      <CardDescription>{tier.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">Custom Pricing</div>
                      <ul className="mt-4 space-y-2 text-sm">
                        {tier.features.map((feature) => (
                          <li key={feature} className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-green-500" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                    <CardFooter>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() =>
                          window.open(enterpriseContactLink, "_blank")
                        }
                      >
                        Contact Sales
                      </Button>
                    </CardFooter>
                  </Card>
                );
              }

              return (
                <Card
                  key={tier.id}
                  className={tier.popular ? "border-primary" : ""}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      {tier.name}
                      {tier.popular && <Badge>Popular</Badge>}
                    </CardTitle>
                    <CardDescription>{tier.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      ${price}
                      <span className="text-sm font-normal text-muted-foreground">
                        /{billingCycle === "yearly" ? "year" : "month"}
                      </span>
                    </div>
                    <ul className="mt-4 space-y-2 text-sm">
                      {tier.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-500" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button
                      className="w-full"
                      disabled={isPending || isCurrentPlan || !priceId}
                      onClick={() => priceId && handleUpgrade(priceId)}
                    >
                      {isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      {isCurrentPlan ? "Current Plan" : "Upgrade"}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Downgrade blockers warning */}
      {usage.downgradeBlockers.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium mb-2">
              Cannot downgrade to a lower plan due to current usage:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              {usage.downgradeBlockers.map((blocker) => (
                <li key={blocker.feature}>{blocker.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Separator className="my-4" />

      <BillingDetailsForm
        workspaceSlug={organizationSlug}
        organizationId={organizationId}
        organizationName={organizationName}
        initial={billingDetails}
        canManageBilling={canManageBilling}
      />
    </div>
  );
}
