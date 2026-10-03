import type {
  OperationStatus,
  PlatformOperationAction,
  SafekeeperState,
} from "@repo/control-plane-contract";

/** How a state pill is coloured; the label always carries the meaning too. */
export type Tone = "good" | "info" | "warn" | "bad" | "neutral";

export function operationTone(status: OperationStatus): Tone {
  switch (status) {
    case "finished":
      return "good";
    case "scheduling":
    case "running":
      return "info";
    case "failed":
      return "bad";
    case "cancelled":
      return "neutral";
  }
}

export function safekeeperTone(state: SafekeeperState): Tone {
  switch (state) {
    case "active":
      return "good";
    case "creating":
      return "info";
    case "retiring":
      return "warn";
    case "retired":
      return "neutral";
  }
}

/** The storage controller's `availability`: Active, WarmingUp, Offline. */
export function availabilityTone(availability: string | null): Tone {
  if (availability === "Active") return "good";
  if (availability === "WarmingUp") return "warn";
  if (availability === "Offline") return "bad";
  return "neutral";
}

/** The storage controller's scheduling policy; anything but Active keeps shards away. */
export function schedulingTone(scheduling: string | null): Tone {
  if (scheduling === null) return "neutral";
  return scheduling === "Active" ? "good" : "warn";
}

export const OPERATION_STATUS_LABELS: Record<OperationStatus, string> = {
  scheduling: "Scheduled",
  running: "Running",
  finished: "Finished",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const OPERATION_ACTION_LABELS: Record<PlatformOperationAction, string> =
  {
    "pageservers.rebalance": "Rebalance pageservers",
    "safekeepers.spread": "Spread safekeepers",
  };

const BYTE_UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] as const;

/** `16 GiB`, `412.5 GiB`; "unknown" when Kubernetes did not report it. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "unknown";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${text} ${BYTE_UNITS[unit]}`;
}

/** `8 cores`, `0.5 cores`; "unknown" when not reported. */
export function formatCpu(millis: number | null): string {
  if (millis === null) return "unknown";
  const cores = millis / 1000;
  const text = Number.isInteger(cores) ? String(cores) : cores.toFixed(2);
  return `${text} ${cores === 1 ? "core" : "cores"}`;
}

/** `2026-10-03 10:00:05 UTC`; fixed format so server and test output agree. */
export function formatTimestamp(iso: string | null): string {
  if (iso === null) return "-";
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return iso;
  return `${time.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

/** `42s`, `3m 05s`, `1h 02m`: the time between two timestamps (or until `now`). */
export function formatDuration(
  startIso: string,
  endIso: string | null,
  now: Date = new Date(),
): string {
  const start = new Date(startIso).getTime();
  const end = endIso === null ? now.getTime() : new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return "-";
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}
