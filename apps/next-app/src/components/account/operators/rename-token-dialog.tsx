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
import { readError } from "./format";
import type { OperatorTokenView } from "./types";

export function RenameTokenDialog({
  operatorId,
  token,
  onOpenChange,
  onRenamed,
}: {
  operatorId: string;
  /** Key to rename; `null` closes the dialog. */
  token: OperatorTokenView | null;
  onOpenChange: (open: boolean) => void;
  onRenamed: () => Promise<void> | void;
}) {
  const open = token !== null;
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLabel(token?.label ?? "");
    setError(null);
    setSaving(false);
  }, [open, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setError(null);
    const trimmed = label.trim();
    try {
      const res = await fetch(
        `/api/account/operators/${operatorId}/tokens/${token.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ label: trimmed.length > 0 ? trimmed : null }),
        },
      );
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      await onRenamed();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename key</DialogTitle>
            <DialogDescription>
              Labels help you tell keys apart. Leave empty to clear the label.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label
                htmlFor="rename-token-label"
                className="text-xs uppercase text-muted-foreground"
              >
                Label
              </Label>
              <Input
                id="rename-token-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. CI"
                maxLength={60}
                className="mt-1"
                autoFocus
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
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
