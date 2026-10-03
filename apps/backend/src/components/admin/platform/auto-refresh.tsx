"use client";

import { OPERATION_POLL_MS } from "@/lib/platform/operations";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-renders the server page every few seconds while `active`, so a running
 * operation's status and step outputs stay current without a manual reload.
 */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), OPERATION_POLL_MS);
    return () => clearInterval(timer);
  }, [active, router]);

  if (!active) return null;
  return (
    <p className="text-xs text-muted-foreground" aria-live="polite">
      Updating every {OPERATION_POLL_MS / 1000} seconds while an operation is
      active.
    </p>
  );
}
