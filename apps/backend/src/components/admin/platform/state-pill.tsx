import type { Tone } from "@/lib/platform/format";
import { Badge } from "@repo/react-ui/components/ui/badge";
import { cn } from "@repo/react-ui/lib/utils";
import type { ReactNode } from "react";

const TONES: Record<Tone, string> = {
  good: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  info: "border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  warn: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  bad: "border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  neutral: "border-transparent bg-muted text-muted-foreground",
};

/** A coloured pill for a state. The text always says the state; colour only helps scanning. */
export function StatePill({
  tone,
  children,
  className,
}: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("whitespace-nowrap font-medium", TONES[tone], className)}
    >
      {children}
    </Badge>
  );
}
