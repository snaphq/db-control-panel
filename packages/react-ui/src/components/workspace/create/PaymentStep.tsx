"use client";

import {
  AddressElement,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../ui/button";
import { CostSummary } from "./CostSummary";

interface Props {
  workspaceName: string;
  planLabel: string;
  planPrice: string;
  trialCredit: string | null;
  withTrial: boolean;
  onBack: () => void;
  onConfirmed: (paymentMethodId: string) => Promise<void>;
}

export function PaymentStep({
  planLabel,
  planPrice,
  trialCredit,
  withTrial,
  onBack,
  onConfirmed,
}: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Please check your card details.");
      setSubmitting(false);
      return;
    }

    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/workspace/new?confirmed=1`,
      },
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message ?? "Card could not be confirmed.");
      setSubmitting(false);
      return;
    }

    const pm = setupIntent?.payment_method;
    const paymentMethodId = typeof pm === "string" ? pm : pm?.id;
    if (!paymentMethodId) {
      setError("Could not read payment method. Please try again.");
      setSubmitting(false);
      return;
    }

    try {
      await onConfirmed(paymentMethodId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create workspace";
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {withTrial && trialCredit && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
          <span className="text-sm font-medium">Trial credit</span>
          <span className="text-sm font-medium">{trialCredit}</span>
        </div>
      )}

      <div className="rounded-lg border p-4">
        <PaymentElement
          options={{ layout: { type: "tabs", defaultCollapsed: false } }}
        />
      </div>

      <div className="rounded-lg border p-4">
        <AddressElement
          options={{
            mode: "billing",
            display: { name: "full" },
          }}
        />
      </div>

      <CostSummary
        disclaimer={
          withTrial
            ? `Continuing will start a free ${planLabel} trial. You will be charged in 14 days or once the included credit is used, whichever happens first. Cancel at any time.`
            : `You will be charged ${planPrice} today and on a recurring basis. Cancel at any time.`
        }
        rows={[
          { label: planLabel, value: planPrice },
          { label: "1 member", value: "$0", muted: true },
        ]}
      />

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          className="h-11 w-full"
          onClick={handleSubmit}
          disabled={!stripe || !elements || submitting}
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-10 w-full"
          onClick={onBack}
          disabled={submitting}
        >
          Back
        </Button>
      </div>
    </div>
  );
}
