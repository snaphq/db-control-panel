"use client";

import { ArrowDown, ArrowUp, Loader2, Minus } from "lucide-react";
import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";

interface Props {
  title: string;
  description?: string;
  total?: string;
  delta?: number | null;
  loading?: boolean;
  empty?: boolean;
  error?: string | null;
  children: ReactNode;
}

function DeltaPill({ delta }: { delta: number }) {
  if (delta === 0 || !Number.isFinite(delta)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        0%
      </span>
    );
  }
  const positive = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ${
        positive
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
      }`}
    >
      {positive ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowDown className="h-3 w-3" />
      )}
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

export function ChartCard({
  title,
  description,
  total,
  delta,
  loading,
  empty,
  error,
  children,
}: Props) {
  return (
    <Card>
      <CardHeader className="space-y-1 pb-2">
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          {delta != null && !loading && !error ? (
            <DeltaPill delta={delta} />
          ) : null}
        </div>
        {total ? (
          <div className="text-2xl font-semibold tracking-tight">{total}</div>
        ) : null}
        {description ? (
          <CardDescription className="text-xs">{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="pt-2">
        {loading ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-rose-500">
            {error}
          </div>
        ) : empty ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
            No data in range.
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
