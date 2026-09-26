"use client";

import type { PricingPlan } from "@repo/billing";
import { Badge } from "@repo/react-ui/components/ui/badge";
import { Button } from "@repo/react-ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/react-ui/components/ui/dialog";
import { Input } from "@repo/react-ui/components/ui/input";
import { Label } from "@repo/react-ui/components/ui/label";
import { Textarea } from "@repo/react-ui/components/ui/textarea";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ValidateResult = {
  valid: boolean;
  amount?: number;
  currency?: string;
  interval?: string;
  active?: boolean;
  productName?: string;
  error?: string;
};

type PriceFieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
};

function PriceIdField({ label, value, onChange }: PriceFieldProps) {
  const [hint, setHint] = useState<ValidateResult | null>(null);
  const [checking, setChecking] = useState(false);

  async function validate() {
    if (!value.trim()) {
      setHint(null);
      return;
    }
    setChecking(true);
    try {
      const res = await fetch(
        "/api/admin/pricing-plans/validate-stripe-price",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priceId: value.trim() }),
        },
      );
      const data: ValidateResult = await res.json();
      setHint(data);
    } catch {
      setHint({ valid: false, error: "Network error" });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <div className="flex gap-2 items-center">
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setHint(null);
          }}
          onBlur={validate}
          placeholder="price_..."
          className="font-mono text-sm"
        />
        {checking && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
        {!checking && hint?.valid && (
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
        )}
        {!checking && hint && !hint.valid && (
          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
        )}
      </div>
      {hint?.valid && (
        <p className="text-xs text-muted-foreground">
          {hint.productName} · {hint.currency?.toUpperCase()}{" "}
          {hint.amount?.toFixed(2)} / {hint.interval}
          {hint.active === false ? " (inactive)" : ""}
        </p>
      )}
      {hint && !hint.valid && (
        <p className="text-xs text-red-500">{hint.error ?? "Invalid price"}</p>
      )}
    </div>
  );
}

type FormState = {
  key: string;
  displayName: string;
  description: string;
  isPaid: boolean;
  sortOrder: number;
  stripeProductId: string;
  monthlyPriceId: string;
  yearlyPriceId: string;
  monthlyDisplayPrice: string;
  yearlyDisplayPrice: string;
  costLabel: string;
  features: string;
  isPopular: boolean;
  isExclusive: boolean;
  actionLabel: string;
  hideFromPricing: boolean;
};

const BLANK_FORM: FormState = {
  key: "",
  displayName: "",
  description: "",
  isPaid: false,
  sortOrder: 0,
  stripeProductId: "",
  monthlyPriceId: "",
  yearlyPriceId: "",
  monthlyDisplayPrice: "",
  yearlyDisplayPrice: "",
  costLabel: "",
  features: "",
  isPopular: false,
  isExclusive: false,
  actionLabel: "",
  hideFromPricing: false,
};

function planToForm(plan: PricingPlan): FormState {
  return {
    key: plan.key,
    displayName: plan.displayName,
    description: plan.description ?? "",
    isPaid: plan.isPaid,
    sortOrder: plan.sortOrder,
    stripeProductId: plan.stripeProductId ?? "",
    monthlyPriceId: plan.monthlyPriceId ?? "",
    yearlyPriceId: plan.yearlyPriceId ?? "",
    monthlyDisplayPrice: plan.monthlyDisplayPrice ?? "",
    yearlyDisplayPrice: plan.yearlyDisplayPrice ?? "",
    costLabel: plan.costLabel ?? "",
    features: (plan.features ?? []).join("\n"),
    isPopular: plan.isPopular,
    isExclusive: plan.isExclusive,
    actionLabel: plan.actionLabel ?? "",
    hideFromPricing: plan.hideFromPricing,
  };
}

function formToBody(form: FormState) {
  return {
    key: form.key.trim(),
    displayName: form.displayName.trim(),
    description: form.description.trim() || null,
    isPaid: form.isPaid,
    sortOrder: form.sortOrder,
    stripeProductId: form.stripeProductId.trim() || null,
    monthlyPriceId: form.monthlyPriceId.trim() || null,
    yearlyPriceId: form.yearlyPriceId.trim() || null,
    monthlyDisplayPrice: form.monthlyDisplayPrice.trim() || null,
    yearlyDisplayPrice: form.yearlyDisplayPrice.trim() || null,
    costLabel: form.costLabel.trim() || null,
    features: form.features
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    isPopular: form.isPopular,
    isExclusive: form.isExclusive,
    actionLabel: form.actionLabel.trim() || null,
    hideFromPricing: form.hideFromPricing,
  };
}

export function PricingPlansManager({
  initialPlans,
}: {
  initialPlans: PricingPlan[];
}) {
  const [plans, setPlans] = useState<PricingPlan[]>(initialPlans);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PricingPlan | null>(null);
  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  function openAdd() {
    setEditing(null);
    setForm({ ...BLANK_FORM, sortOrder: plans.length });
    setDialogOpen(true);
  }

  function openEdit(plan: PricingPlan) {
    setEditing(plan);
    setForm(planToForm(plan));
    setDialogOpen(true);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.key.trim() || !form.displayName.trim()) {
      toast.error("Key and display name are required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/admin/pricing-plans/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formToBody(form)),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "Update failed");
        }
        const { plan } = await res.json();
        setPlans((prev) => prev.map((p) => (p.id === plan.id ? plan : p)));
        toast.success("Plan updated");
      } else {
        const res = await fetch("/api/admin/pricing-plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formToBody(form)),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "Create failed");
        }
        const { plan } = await res.json();
        setPlans((prev) => [...prev, plan]);
        toast.success("Plan created");
      }
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(plan: PricingPlan) {
    if (!confirm(`Delete plan "${plan.displayName}"? This cannot be undone.`))
      return;
    setDeleting(plan.id);
    try {
      const res = await fetch(`/api/admin/pricing-plans/${plan.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Delete failed");
      }
      setPlans((prev) => prev.filter((p) => p.id !== plan.id));
      toast.success("Plan deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const next = [...plans];
    const swap = index + direction;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setPlans(next);
    setReordering(true);
    try {
      const res = await fetch("/api/admin/pricing-plans/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: next.map((p) => p.id) }),
      });
      if (!res.ok) throw new Error("Reorder failed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reorder failed");
      setPlans(plans);
    } finally {
      setReordering(false);
    }
  }

  return (
    <>
      <div className="flex justify-end mb-2">
        <Button onClick={openAdd} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add plan
        </Button>
      </div>

      <div className="rounded-md border divide-y">
        {plans.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No pricing plans yet.
          </p>
        )}
        {plans.map((plan, i) => (
          <div
            key={plan.id}
            className="flex items-center gap-3 px-4 py-3 text-sm"
          >
            <div className="flex flex-col gap-1 mr-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                disabled={i === 0 || reordering}
                onClick={() => move(i, -1)}
              >
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                disabled={i === plans.length - 1 || reordering}
                onClick={() => move(i, 1)}
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{plan.displayName}</span>
                <code className="text-xs text-muted-foreground">
                  {plan.key}
                </code>
                {plan.isPopular && (
                  <Badge variant="secondary" className="text-xs">
                    Popular
                  </Badge>
                )}
                {plan.isExclusive && (
                  <Badge variant="outline" className="text-xs">
                    Enterprise
                  </Badge>
                )}
                {plan.hideFromPricing && (
                  <Badge
                    variant="outline"
                    className="text-xs text-muted-foreground"
                  >
                    Hidden
                  </Badge>
                )}
              </div>
              <div className="text-muted-foreground text-xs mt-0.5 flex gap-3 flex-wrap">
                {plan.monthlyDisplayPrice && (
                  <span>{plan.monthlyDisplayPrice}</span>
                )}
                {plan.monthlyPriceId && (
                  <code className="truncate max-w-[180px]">
                    {plan.monthlyPriceId}
                  </code>
                )}
                {plan.features && plan.features.length > 0 && (
                  <span>
                    {plan.features.length} feature
                    {plan.features.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => openEdit(plan)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => handleDelete(plan)}
                disabled={deleting === plan.id}
              >
                {deleting === plan.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit plan" : "Add pricing plan"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label>Key *</Label>
                <Input
                  value={form.key}
                  onChange={(e) => setField("key", e.target.value)}
                  placeholder="tier1"
                  disabled={!!editing}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Display Name *</Label>
                <Input
                  value={form.displayName}
                  onChange={(e) => setField("displayName", e.target.value)}
                  placeholder="Pro"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="Everything you need to get started"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label>Stripe Product ID</Label>
              <Input
                value={form.stripeProductId}
                onChange={(e) => setField("stripeProductId", e.target.value)}
                placeholder="prod_..."
                className="font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <PriceIdField
                label="Monthly Price ID"
                value={form.monthlyPriceId}
                onChange={(v) => setField("monthlyPriceId", v)}
              />
              <PriceIdField
                label="Yearly Price ID"
                value={form.yearlyPriceId}
                onChange={(v) => setField("yearlyPriceId", v)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label>Monthly Display Price</Label>
                <Input
                  value={form.monthlyDisplayPrice}
                  onChange={(e) =>
                    setField("monthlyDisplayPrice", e.target.value)
                  }
                  placeholder="$24/month"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Yearly Display Price</Label>
                <Input
                  value={form.yearlyDisplayPrice}
                  onChange={(e) =>
                    setField("yearlyDisplayPrice", e.target.value)
                  }
                  placeholder="$240/year"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label>Cost Label</Label>
                <Input
                  value={form.costLabel}
                  onChange={(e) => setField("costLabel", e.target.value)}
                  placeholder="per user/month"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Action Label</Label>
                <Input
                  value={form.actionLabel}
                  onChange={(e) => setField("actionLabel", e.target.value)}
                  placeholder="Get Started"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label>Features (one per line)</Label>
              <Textarea
                value={form.features}
                onChange={(e) => setField("features", e.target.value)}
                placeholder={
                  "Unlimited projects\nPriority support\nCustom domains"
                }
                rows={4}
                className="text-sm"
              />
            </div>

            <div className="flex flex-wrap gap-6 pt-1">
              {(
                [
                  ["isPaid", "Paid tier"],
                  ["isPopular", "Mark as Popular"],
                  ["isExclusive", "Enterprise (contact pricing)"],
                  ["hideFromPricing", "Hide from pricing page"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form[key] as boolean}
                    onChange={(e) => setField(key, e.target.checked)}
                    id={`check-${key}`}
                    className="h-4 w-4 rounded border-input"
                  />
                  <Label htmlFor={`check-${key}`} className="cursor-pointer">
                    {label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editing ? "Save changes" : "Create plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
