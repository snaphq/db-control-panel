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
import { Check, Copy } from "lucide-react";
import { useState } from "react";

/**
 * Shows a freshly issued key exactly once. `onContinue` adds a primary action
 * (e.g. "Open operator"); `Done` always just closes.
 */
export function PlaintextDialog({
  value,
  onClose,
  continueLabel,
  onContinue,
}: {
  value: string | null;
  onClose: () => void;
  continueLabel?: string;
  onContinue?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog
      open={value !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Operator key created</DialogTitle>
          <DialogDescription>
            Copy this key now. For security reasons, it will not be shown again.
          </DialogDescription>
        </DialogHeader>
        {value ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted p-3 font-mono text-sm">
            <span className="flex-1 truncate">{value}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void copy()}
              className="shrink-0"
            >
              {copied ? (
                <>
                  <Check className="mr-1 h-3 w-3" /> Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-3 w-3" /> Copy
                </>
              )}
            </Button>
          </div>
        ) : null}
        <DialogFooter>
          {onContinue ? (
            <>
              <Button variant="ghost" onClick={onClose}>
                Done
              </Button>
              <Button onClick={onContinue}>
                {continueLabel ?? "Continue"}
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
