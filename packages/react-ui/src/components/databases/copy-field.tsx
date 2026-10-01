"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";

interface CopyFieldProps {
  label?: string;
  value: string;
  className?: string;
}

/** A read-only monospace value with a copy button. */
export function CopyField({ label, value, className }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy");
    }
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      {label && (
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      )}
      <div className="flex items-center gap-2 rounded-md border border-input bg-muted px-3 py-2 font-mono text-xs">
        <span className="min-w-0 flex-1 break-all">{value}</span>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={label ? `Copy ${label}` : "Copy value"}
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
