"use client";

import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface ReferralConfig {
  id: string;
  enabled: boolean;
  referrerCreditAmount: number;
  refereeCreditAmount: number;
  currency: string;
  minPlanTier: string | null;
  autoApply: boolean;
  approvalWindowDays: number;
  createdAt: Date;
  updatedAt: Date;
}

interface FormValues {
  enabled: boolean;
  referrerCreditAmount: number;
  refereeCreditAmount: number;
  currency: string;
  minPlanTier: string;
  autoApply: boolean;
  approvalWindowDays: number;
}

interface Props {
  initialConfig: ReferralConfig;
}

export function ReferralSettingsForm({ initialConfig }: Props) {
  const [values, setValues] = useState<FormValues>({
    enabled: initialConfig.enabled,
    referrerCreditAmount: initialConfig.referrerCreditAmount,
    refereeCreditAmount: initialConfig.refereeCreditAmount,
    currency: initialConfig.currency,
    minPlanTier: initialConfig.minPlanTier ?? "",
    autoApply: initialConfig.autoApply,
    approvalWindowDays: initialConfig.approvalWindowDays,
  });
  const [saving, setSaving] = useState(false);

  const handleChange = <K extends keyof FormValues>(
    key: K,
    value: FormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/referrals/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: values }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Failed to save settings",
        );
      }
      toast.success("Referral settings saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save settings",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-6">
      {/* enabled */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="enabled"
          checked={values.enabled}
          onChange={(e) => handleChange("enabled", e.target.checked)}
          className="h-4 w-4 rounded border-input accent-primary"
        />
        <Label htmlFor="enabled">Enable referral program</Label>
      </div>

      {/* referrerCreditAmount */}
      <div className="space-y-1.5">
        <Label htmlFor="referrerCreditAmount">
          Referrer credit amount{" "}
          <span className="text-muted-foreground font-normal">(cents)</span>
        </Label>
        <Input
          id="referrerCreditAmount"
          type="number"
          min={0}
          step={1}
          value={values.referrerCreditAmount}
          onChange={(e) =>
            handleChange("referrerCreditAmount", Number(e.target.value))
          }
        />
        <p className="text-xs text-muted-foreground">
          Amount credited to the referrer (e.g. 1000 = $10.00).
        </p>
      </div>

      {/* refereeCreditAmount */}
      <div className="space-y-1.5">
        <Label htmlFor="refereeCreditAmount">
          Referee credit amount{" "}
          <span className="text-muted-foreground font-normal">(cents)</span>
        </Label>
        <Input
          id="refereeCreditAmount"
          type="number"
          min={0}
          step={1}
          value={values.refereeCreditAmount}
          onChange={(e) =>
            handleChange("refereeCreditAmount", Number(e.target.value))
          }
        />
        <p className="text-xs text-muted-foreground">
          Amount credited to the new user being referred (e.g. 500 = $5.00).
        </p>
      </div>

      {/* currency */}
      <div className="space-y-1.5">
        <Label htmlFor="currency">Currency</Label>
        <Input
          id="currency"
          type="text"
          value={values.currency}
          onChange={(e) =>
            handleChange("currency", e.target.value.toLowerCase())
          }
          placeholder="usd"
          maxLength={3}
        />
        <p className="text-xs text-muted-foreground">
          ISO 4217 currency code (lowercase), e.g. "usd".
        </p>
      </div>

      {/* minPlanTier */}
      <div className="space-y-1.5">
        <Label htmlFor="minPlanTier">Minimum plan tier</Label>
        <Input
          id="minPlanTier"
          type="text"
          value={values.minPlanTier}
          onChange={(e) => handleChange("minPlanTier", e.target.value)}
          placeholder="tier1"
        />
        <p className="text-xs text-muted-foreground">
          Leave blank to allow all tiers. Must match a plan tier key.
        </p>
      </div>

      {/* autoApply */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="autoApply"
          checked={values.autoApply}
          onChange={(e) => handleChange("autoApply", e.target.checked)}
          className="h-4 w-4 rounded border-input accent-primary"
        />
        <Label htmlFor="autoApply">
          Auto-apply credits (no manual approval required)
        </Label>
      </div>

      {/* approvalWindowDays */}
      <div className="space-y-1.5">
        <Label htmlFor="approvalWindowDays">Approval window (days)</Label>
        <Input
          id="approvalWindowDays"
          type="number"
          min={1}
          step={1}
          value={values.approvalWindowDays}
          onChange={(e) =>
            handleChange("approvalWindowDays", Number(e.target.value))
          }
        />
        <p className="text-xs text-muted-foreground">
          Days after conversion before credits are automatically applied.
        </p>
      </div>

      <div className="pt-2">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save settings
        </Button>
      </div>
    </form>
  );
}
