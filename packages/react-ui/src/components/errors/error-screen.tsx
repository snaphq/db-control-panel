import Link from "next/link";
import type { ReactNode } from "react";

interface ErrorScreenProps {
  code: string;
  title: string;
  /** Optional secondary action (e.g. retry) rendered to the right of "Go home". */
  action?: ReactNode;
}

/**
 * Vercel-style status screen: large status code on the left, vertical divider,
 * short title on the right. Centered in the viewport.
 */
export function ErrorScreen({ code, title, action }: ErrorScreenProps) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 text-foreground">
      <div className="flex items-center gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">{code}</h1>
        <div className="h-12 w-px bg-border" aria-hidden="true" />
        <p className="text-sm font-normal text-muted-foreground">{title}</p>
      </div>
      <div className="mt-10 flex items-center gap-3 text-sm">
        <Link
          href="/"
          className="rounded-md border border-border bg-background px-3 py-1.5 font-medium text-foreground transition-colors hover:bg-muted"
        >
          Go home
        </Link>
        {action}
      </div>
    </div>
  );
}
