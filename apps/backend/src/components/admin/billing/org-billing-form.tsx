"use client";

import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface PlanTierOption {
  key: string;
  displayName: string;
  isPaid: boolean;
}

interface OrgBillingState {
  planTier: string;
  planStatus: string;
  manualOverride: boolean;
  notes: string | null;
  trialEndsAt: string | Date | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | Date | null;
}

const STATUS_OPTIONS = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "paused",
];

export function OrgBillingForm({
  organizationId,
  initial,
  tiers,
}: {
  organizationId: string;
  initial: OrgBillingState;
  tiers: PlanTierOption[];
}) {
  const [planTier, setPlanTier] = useState(initial.planTier);
  const [planStatus, setPlanStatus] = useState(initial.planStatus);
  const [manualOverride, setManualOverride] = useState(initial.manualOverride);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [trialEndsAt, setTrialEndsAt] = useState(
    initial.trialEndsAt
      ? new Date(initial.trialEndsAt).toISOString().slice(0, 10)
      : "",
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/organizations/${organizationId}/billing`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planTier,
            planStatus,
            manualOverride,
            notes: notes.trim() || null,
            trialEndsAt: trialEndsAt
              ? new Date(trialEndsAt).toISOString()
              : null,
          }),
        },
      );
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success("Billing updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Plan Tier</Label>
          <select
            className="w-full h-9 rounded-md border bg-transparent px-3 text-sm"
            value={planTier}
            onChange={(e) => setPlanTier(e.target.value)}
          >
            {tiers.map((t) => (
              <option key={t.key} value={t.key}>
                {t.displayName} ({t.key}){t.isPaid ? " · paid" : ""}
              </option>
            ))}
            {!tiers.find((t) => t.key === planTier) && (
              <option value={planTier}>{planTier} (unknown)</option>
            )}
          </select>
        </div>

        <div className="space-y-2">
          <Label>Status</Label>
          <select
            className="w-full h-9 rounded-md border bg-transparent px-3 text-sm"
            value={planStatus}
            onChange={(e) => setPlanStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label>Trial Ends At</Label>
          <Input
            type="date"
            value={trialEndsAt}
            onChange={(e) => setTrialEndsAt(e.target.value)}
          />
        </div>

        <div className="space-y-2 flex items-end">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={manualOverride}
              onChange={(e) => setManualOverride(e.target.checked)}
            />
            Manual override (ignore Stripe webhooks)
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Notes</Label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal notes (not visible to org members)"
        />
      </div>

      {initial.stripeSubscriptionId && (
        <div className="text-xs text-muted-foreground">
          Stripe Subscription:{" "}
          <code className="bg-muted px-1 rounded">
            {initial.stripeSubscriptionId}
          </code>
        </div>
      )}

      <div>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save Billing
        </Button>
      </div>
    </div>
  );
}
