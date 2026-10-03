import {
  OPERATION_ACTION_LABELS,
  formatDuration,
  formatTimestamp,
} from "@/lib/platform/format";
import {
  describeTrigger,
  formatOutput,
  stepRows,
} from "@/lib/platform/operations";
import type { PlatformOperation } from "@repo/control-plane-contract";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/react-ui/components/ui/alert";
import { OperationStatusPill } from "./operations-table";
import { StatePill } from "./state-pill";

const STEP_PILL = {
  done: { tone: "good", label: "Done" },
  running: { tone: "info", label: "Running" },
  pending: { tone: "neutral", label: "Pending" },
} as const;

export function OperationDetail({
  operation,
}: { operation: PlatformOperation }) {
  const rows = stepRows(operation);
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <OperationStatusPill operation={operation} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Started by</dt>
          <dd>{describeTrigger(operation.params)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Failed attempts</dt>
          <dd>{operation.failures_count}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Created</dt>
          <dd>{formatTimestamp(operation.created_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {operation.finished_at ? "Finished" : "Last update"}
          </dt>
          <dd>
            {formatTimestamp(operation.finished_at ?? operation.updated_at)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Duration</dt>
          <dd>{formatDuration(operation.created_at, operation.finished_at)}</dd>
        </div>
      </dl>
      {operation.error ? (
        <Alert variant="destructive">
          <AlertTitle>
            {OPERATION_ACTION_LABELS[operation.action]} reported an error
          </AlertTitle>
          <AlertDescription>
            <pre className="whitespace-pre-wrap font-mono text-xs">
              {operation.error}
            </pre>
          </AlertDescription>
        </Alert>
      ) : null}
      <ol className="flex flex-col gap-2">
        {rows.map((row, index) => {
          const pill = STEP_PILL[row.state];
          const hasOutput = row.output !== undefined;
          return (
            <li key={row.name} className="rounded-md border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">{index + 1}.</span>
                <span className="font-medium">{row.name}</span>
                <StatePill tone={pill.tone}>{pill.label}</StatePill>
              </div>
              {hasOutput ? (
                <pre className="mt-2 max-h-80 overflow-auto rounded bg-muted/50 p-3 font-mono text-xs">
                  {formatOutput(row.output)}
                </pre>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
