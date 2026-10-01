"use client";

import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { Progress } from "../ui/progress";
import { type TrackedOperation, isTerminal } from "./use-operation-tracker";

const PROGRESS: Record<TrackedOperation["status"], number> = {
  scheduling: 15,
  running: 60,
  finished: 100,
  failed: 100,
  cancelled: 100,
};

const STATUS_TEXT: Record<TrackedOperation["status"], string> = {
  scheduling: "Queued",
  running: "In progress",
  finished: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

interface OperationsBannerProps {
  operations: TrackedOperation[];
  onDismiss: (id: string) => void;
}

/** Progress of the operations this page started, until they reach a terminal state. */
export function OperationsBanner({
  operations,
  onDismiss,
}: OperationsBannerProps) {
  if (operations.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {operations.map((op) => {
        const failed = op.status === "failed" || op.status === "cancelled";
        return (
          <div
            key={op.id}
            className="flex flex-col gap-2 rounded-lg border bg-card p-3"
          >
            <div className="flex items-center gap-2 text-sm">
              {!isTerminal(op.status) && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {op.status === "finished" && (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              )}
              {failed && <AlertCircle className="h-4 w-4 text-destructive" />}
              <span className="font-medium">{op.label}</span>
              <span className="text-muted-foreground">
                {STATUS_TEXT[op.status]}
              </span>
              {isTerminal(op.status) && (
                <button
                  type="button"
                  onClick={() => onDismiss(op.id)}
                  className="ml-auto text-muted-foreground hover:text-foreground"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {!isTerminal(op.status) && (
              <Progress value={PROGRESS[op.status]} className="h-1.5" />
            )}
            {failed && op.error && (
              <p className="text-sm text-destructive">{op.error}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
