import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  note?: string | null;
}

/** Explains what a section is for and what to do next. */
export function EmptyState({
  title,
  description,
  action,
  note,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-xl text-sm text-muted-foreground">{description}</p>
      {action}
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}
