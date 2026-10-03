import {
  OPERATION_ACTION_LABELS,
  OPERATION_STATUS_LABELS,
  formatDuration,
  formatTimestamp,
  operationTone,
} from "@/lib/platform/format";
import { describeTrigger } from "@/lib/platform/operations";
import type { PlatformOperation } from "@repo/control-plane-contract";
import Link from "next/link";
import { StatePill } from "./state-pill";

export function OperationStatusPill({
  operation,
}: { operation: PlatformOperation }) {
  return (
    <StatePill tone={operationTone(operation.status)}>
      {OPERATION_STATUS_LABELS[operation.status]}
    </StatePill>
  );
}

export function OperationsTable({
  operations,
}: { operations: PlatformOperation[] }) {
  if (operations.length === 0) {
    return (
      <p className="rounded-md border p-4 text-sm text-muted-foreground">
        No platform operations yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            <th className="h-12 px-4 font-medium">Operation</th>
            <th className="h-12 px-4 font-medium">Status</th>
            <th className="h-12 px-4 font-medium">Started by</th>
            <th className="h-12 px-4 font-medium">Created</th>
            <th className="h-12 px-4 font-medium">Duration</th>
            <th className="h-12 px-4 font-medium">Steps done</th>
          </tr>
        </thead>
        <tbody>
          {operations.map((operation) => (
            <tr
              key={operation.id}
              className="border-b align-top transition-colors hover:bg-muted/50"
            >
              <td className="p-4">
                <Link
                  className="font-medium underline"
                  href={`/platform/operations/${operation.id}`}
                >
                  {OPERATION_ACTION_LABELS[operation.action]}
                </Link>
                <div className="font-mono text-xs text-muted-foreground">
                  {operation.id}
                </div>
              </td>
              <td className="p-4">
                <OperationStatusPill operation={operation} />
                {operation.failures_count > 0 ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {operation.failures_count} failed attempt
                    {operation.failures_count === 1 ? "" : "s"}
                  </div>
                ) : null}
              </td>
              <td className="p-4">{describeTrigger(operation.params)}</td>
              <td className="p-4 whitespace-nowrap">
                {formatTimestamp(operation.created_at)}
              </td>
              <td className="p-4 whitespace-nowrap">
                {formatDuration(operation.created_at, operation.finished_at)}
              </td>
              <td className="p-4">
                {operation.progress.completed_steps.length > 0
                  ? operation.progress.completed_steps.join(", ")
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
