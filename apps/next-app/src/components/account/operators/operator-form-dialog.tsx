"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { type ScopeMode, ScopeSelector } from "./scope-selector";
import type { OperatorOrganizationOption, OperatorView } from "./types";

const EXPIRATIONS = [
  { value: "1h", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "60d", label: "60 days" },
  { value: "90d", label: "90 days" },
  { value: "180d", label: "180 days" },
  { value: "1y", label: "1 year" },
  { value: "never", label: "Never" },
] as const;

async function readError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return typeof data.error === "string" ? data.error : "Request failed";
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizations: OperatorOrganizationOption[];
  /** When set, the dialog edits this operator instead of creating one. */
  operator?: OperatorView | null;
  onSaved: () => Promise<void> | void;
  onCreated: (plaintext: string) => void;
};

export function OperatorFormDialog({
  open,
  onOpenChange,
  organizations,
  operator = null,
  onSaved,
  onCreated,
}: Props) {
  const editing = operator !== null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<ScopeMode>("all_owned");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expiration, setExpiration] = useState<string>("30d");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(operator?.name ?? "");
    setDescription(operator?.description ?? "");
    if (operator?.scope.mode === "organizations") {
      setMode("organizations");
      setSelectedIds(operator.scope.organizationIds);
    } else {
      setMode("all_owned");
      setSelectedIds([]);
    }
    setExpiration("30d");
    setLabel("");
    setSaving(false);
    setError(null);
  }, [open, operator]);

  const scopeInvalid = mode === "organizations" && selectedIds.length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || scopeInvalid) return;
    setSaving(true);
    setError(null);
    const scope =
      mode === "all_owned"
        ? { mode: "all_owned" }
        : { mode: "organizations", organizationIds: selectedIds };
    try {
      if (editing && operator) {
        const res = await fetch(`/api/account/operators/${operator.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            scope,
          }),
        });
        if (!res.ok) {
          setError(await readError(res));
          return;
        }
        await onSaved();
        onOpenChange(false);
        return;
      }

      const res = await fetch("/api/account/operators", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          scope,
          expiration,
          label: label.trim(),
        }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const data = (await res.json()) as { plaintext: string };
      await onSaved();
      onOpenChange(false);
      onCreated(data.plaintext);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit operator" : "Create operator"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Update the operator name, description, or organization scope. Changes apply immediately."
                : "Operators are named machine identities. Programmatic requests authenticate as this operator and are attributed to it."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label
                htmlFor="operator-name"
                className="text-xs uppercase text-muted-foreground"
              >
                Operator name
              </Label>
              <Input
                id="operator-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Claude, n8n pipeline, CI"
                maxLength={120}
                className="mt-1"
                required
              />
            </div>

            <div>
              <Label
                htmlFor="operator-description"
                className="text-xs uppercase text-muted-foreground"
              >
                Description (optional)
              </Label>
              <Textarea
                id="operator-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What uses this operator?"
                maxLength={500}
                className="mt-1"
                rows={2}
              />
            </div>

            <ScopeSelector
              organizations={organizations}
              mode={mode}
              onModeChange={setMode}
              selectedIds={selectedIds}
              onChangeSelectedIds={setSelectedIds}
            />

            {!editing ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label
                    htmlFor="operator-expiration"
                    className="text-xs uppercase text-muted-foreground"
                  >
                    Token expiration
                  </Label>
                  <select
                    id="operator-expiration"
                    value={expiration}
                    onChange={(e) => setExpiration(e.target.value)}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {EXPIRATIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label
                    htmlFor="operator-label"
                    className="text-xs uppercase text-muted-foreground"
                  >
                    Token label (optional)
                  </Label>
                  <Input
                    id="operator-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. laptop"
                    maxLength={60}
                    className="mt-1"
                  />
                </div>
              </div>
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !name.trim() || scopeInvalid}
            >
              {saving
                ? "Saving..."
                : editing
                  ? "Save changes"
                  : "Create operator"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
