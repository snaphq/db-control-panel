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
import { useEffect, useState } from "react";
import {
  DEFAULT_EXPIRATION,
  ExpirationOptions,
  SELECT_CLASS_NAME,
} from "./expirations";
import { readError } from "./format";

export function AddTokenDialog({
  operator,
  onOpenChange,
  onCreated,
}: {
  /** Operator to issue a key for; `null` closes the dialog. */
  operator: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (plaintext: string) => void;
}) {
  const open = operator !== null;
  const [expiration, setExpiration] = useState<string>(DEFAULT_EXPIRATION);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setExpiration(DEFAULT_EXPIRATION);
    setLabel("");
    setError(null);
    setSaving(false);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!operator) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/account/operators/${operator.id}/tokens`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expiration, label: label.trim() }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const data = (await res.json()) as { plaintext: string };
      onOpenChange(false);
      onCreated(data.plaintext);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add key</DialogTitle>
            <DialogDescription>
              Issue a new key for {operator?.name}. Existing keys keep working
              until revoked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label
                htmlFor="new-token-expiration"
                className="text-xs uppercase text-muted-foreground"
              >
                Expiration
              </Label>
              <select
                id="new-token-expiration"
                value={expiration}
                onChange={(e) => setExpiration(e.target.value)}
                className={SELECT_CLASS_NAME}
              >
                <ExpirationOptions />
              </select>
            </div>
            <div>
              <Label
                htmlFor="new-token-label"
                className="text-xs uppercase text-muted-foreground"
              >
                Label (optional)
              </Label>
              <Input
                id="new-token-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. CI"
                maxLength={60}
                className="mt-1"
              />
            </div>
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
            <Button type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
