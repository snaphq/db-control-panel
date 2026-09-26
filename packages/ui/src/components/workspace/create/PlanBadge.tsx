import { cn } from "../../../lib/utils";

export type PlanBadgeKind = "free" | "pro" | "pro-trial";

interface Props {
  kind: PlanBadgeKind;
  className?: string;
}

const LABELS: Record<PlanBadgeKind, string> = {
  free: "Free",
  pro: "Pro",
  "pro-trial": "Pro Trial",
};

export function PlanBadge({ kind, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-[#0091FF] px-2.5 py-0.5 text-xs font-medium text-white",
        kind === "free" && "bg-muted text-foreground",
        className,
      )}
    >
      {LABELS[kind]}
    </span>
  );
}
