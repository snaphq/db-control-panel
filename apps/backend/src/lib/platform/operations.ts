import type {
  OperationStatus,
  PlatformOperation,
  PlatformOperationAction,
} from "@repo/control-plane-contract";

/** The poll interval for operations that have not settled. */
export const OPERATION_POLL_MS = 3000;

export function isActiveStatus(status: OperationStatus): boolean {
  return status === "scheduling" || status === "running";
}

export function hasActiveOperation(operations: PlatformOperation[]): boolean {
  return operations.some((operation) => isActiveStatus(operation.status));
}

/** Steps in the order the worker runs them (docs-internal/platform/control-plane.mdx). */
const STEPS: Record<PlatformOperationAction, readonly string[]> = {
  "safekeepers.spread": [
    "plan",
    "create",
    "ready",
    "register",
    "migrate",
    "retire",
  ],
  "pageservers.rebalance": ["plan", "execute"],
};

type StepState = "done" | "running" | "pending";

export interface StepRow {
  name: string;
  state: StepState;
  /** What the step recorded; for a running step, its checkpoint. */
  output: unknown;
}

/**
 * The operation's steps with their state: finished steps are the control
 * plane's `completed_steps`; the first step after them is the running one while
 * the operation is active. A step the portal does not know (a newer worker)
 * still shows, after the known ones, because it has an output or is complete.
 */
export function stepRows(operation: PlatformOperation): StepRow[] {
  const { completed_steps: completed, outputs } = operation.progress;
  const known = STEPS[operation.action];
  const extra = [...completed, ...Object.keys(outputs)].filter(
    (name, index, all) => !known.includes(name) && all.indexOf(name) === index,
  );
  const active = isActiveStatus(operation.status);
  let runningAssigned = false;
  return [...known, ...extra].map((name) => {
    const output = outputs[name];
    if (completed.includes(name)) return { name, state: "done", output };
    if (active && !runningAssigned) {
      runningAssigned = true;
      return { name, state: "running", output };
    }
    return { name, state: "pending", output };
  });
}

/** `manual`, or `pageserver-joined (nodes 4, 5)` for the automatic reasons. */
export function describeTrigger(params: Record<string, unknown>): string {
  const reason = typeof params.reason === "string" ? params.reason : "unknown";
  const nodeIds = Array.isArray(params.nodeIds)
    ? params.nodeIds.filter((id): id is number => typeof id === "number")
    : [];
  if (nodeIds.length === 0) return reason;
  return `${reason} (node${nodeIds.length === 1 ? "" : "s"} ${nodeIds.join(", ")})`;
}

/** Output shown in a `<pre>`: pretty JSON, capped so a huge plan cannot freeze the page. */
export function formatOutput(output: unknown, maxLength = 4000): string {
  const text = JSON.stringify(output, null, 2) ?? "";
  return text.length > maxLength
    ? `${text.slice(0, maxLength)}\n... (${text.length - maxLength} more characters)`
    : text;
}
