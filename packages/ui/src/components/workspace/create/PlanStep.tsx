"use client";

import { AlertCircle } from "lucide-react";
import type { ChangeEvent } from "react";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";

export type PlanChoice = "free" | "pro" | "pro-trial";

interface Props {
  name: string;
  slug: string;
  onNameChange: (v: string) => void;
  onSlugChange: (v: string) => void;
  plan: PlanChoice;
  onPlanChange: (p: PlanChoice) => void;
  canCreateFree: boolean;
  canUseTrial: boolean;
  nameError: string | null;
  onContinue: () => void;
  onCancel: () => void;
}

export function PlanStep({
  name,
  slug,
  onNameChange,
  onSlugChange,
  plan,
  onPlanChange,
  canCreateFree,
  canUseTrial,
  nameError,
  onContinue,
  onCancel,
}: Props) {
  const handleName = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onNameChange(v);
    const autoSlug = v
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    onSlugChange(autoSlug);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Label htmlFor="workspace-name">Workspace Name</Label>
        <Input
          id="workspace-name"
          value={name}
          onChange={handleName}
          placeholder="Acme Marketing"
          aria-invalid={Boolean(nameError)}
          className={cn(
            "h-11",
            nameError && "border-destructive focus-visible:ring-destructive",
          )}
        />
        {nameError && (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            {nameError}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          URL: /dashboard/
          <span className="font-medium text-foreground">
            {slug || "your-workspace"}
          </span>
        </p>
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Plan</legend>
        <PlanCard
          title="Pro Trial"
          description="Try all Pro features free for 14 days"
          selected={plan === "pro-trial"}
          disabled={!canUseTrial}
          disabledHint="Trial already used"
          onClick={() => onPlanChange("pro-trial")}
        />
        <PlanCard
          title="Pro"
          description="Everything you need to scale cold email"
          selected={plan === "pro"}
          onClick={() => onPlanChange("pro")}
        />
        {canCreateFree && (
          <PlanCard
            title="Free"
            description="One free workspace, limited features"
            selected={plan === "free"}
            className="sm:col-span-2"
            onClick={() => onPlanChange("free")}
          />
        )}
      </fieldset>

      <div className="mt-2 flex flex-col gap-2">
        <Button
          type="button"
          className="h-11 w-full"
          onClick={onContinue}
          disabled={!name.trim()}
        >
          {plan === "free" ? "Create Workspace" : "Continue"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-10 w-full"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function PlanCard({
  title,
  description,
  selected,
  disabled,
  disabledHint,
  className,
  onClick,
}: {
  title: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  disabledHint?: string;
  className?: string;
  onClick: () => void;
}) {
  return (
    <label
      className={cn(
        "relative flex cursor-pointer flex-col gap-1 rounded-lg border p-4 text-left transition-colors",
        selected
          ? "border-[#0091FF] bg-[#0091FF]/[0.14]"
          : "border-border hover:bg-accent/50",
        disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
        className,
      )}
    >
      <input
        type="radio"
        name="workspace-plan"
        className="sr-only"
        checked={selected}
        disabled={disabled}
        onChange={onClick}
      />
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">
        {disabled && disabledHint ? disabledHint : description}
      </span>
      <span
        aria-hidden
        className={cn(
          "absolute right-4 top-4 h-3.5 w-3.5 rounded-full border",
          selected
            ? "border-[#0091FF] bg-[#0091FF]"
            : "border-muted-foreground/40",
        )}
      />
    </label>
  );
}
