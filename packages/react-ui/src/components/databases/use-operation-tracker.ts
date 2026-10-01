"use client";

import type { Operation, OperationStatus } from "@repo/control-plane-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DatabasesApi } from "./api";

const POLL_INTERVAL_MS = 2500;
/** Consecutive failed polls before the tracker stops waiting for an operation. */
const MAX_POLL_FAILURES = 5;

export interface TrackedOperation {
  id: string;
  label: string;
  status: OperationStatus;
  error: string | null;
}

export function isTerminal(status: OperationStatus): boolean {
  return status === "finished" || status === "failed" || status === "cancelled";
}

function fromOperation(label: string, op: Operation): TrackedOperation {
  return { id: op.id, label, status: op.status, error: op.error };
}

/**
 * Follows long database operations: polls `/operations/:id` every 2.5 seconds
 * until each one finishes, fails or is cancelled, then calls `onSettled` so
 * the caller can reload what the operation changed.
 */
export function useOperationTracker(
  api: DatabasesApi,
  onSettled: (op: TrackedOperation) => void,
) {
  const [operations, setOperations] = useState<TrackedOperation[]>([]);
  const failures = useRef(new Map<string, number>());
  const settled = useRef(onSettled);
  settled.current = onSettled;
  const active = operations.filter((op) => !isTerminal(op.status));
  const hasActive = active.length > 0;

  const track = useCallback((op: Operation, label: string) => {
    setOperations((current) => [
      fromOperation(label, op),
      ...current.filter((existing) => existing.id !== op.id),
    ]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setOperations((current) => current.filter((op) => op.id !== id));
  }, []);

  // Polling reads the latest list from a ref so one interval serves all ops.
  const latest = useRef(operations);
  latest.current = operations;

  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(async () => {
      const pending = latest.current.filter((op) => !isTerminal(op.status));
      const updates = await Promise.all(
        pending.map(async (op): Promise<TrackedOperation> => {
          try {
            const { operation } = await api.operation(op.id);
            failures.current.delete(op.id);
            return fromOperation(op.label, operation);
          } catch (error) {
            const count = (failures.current.get(op.id) ?? 0) + 1;
            failures.current.set(op.id, count);
            if (count < MAX_POLL_FAILURES) return op;
            return {
              ...op,
              status: "failed",
              error:
                error instanceof Error
                  ? `Lost track of this operation: ${error.message}`
                  : "Lost track of this operation.",
            };
          }
        }),
      );
      const changed = updates.filter(
        (next, index) => next.status !== pending[index]?.status,
      );
      if (changed.length === 0) return;
      setOperations((current) =>
        current.map((op) => changed.find((next) => next.id === op.id) ?? op),
      );
      for (const next of changed) settled.current(next);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasActive, api]);

  return { operations, track, dismiss };
}
