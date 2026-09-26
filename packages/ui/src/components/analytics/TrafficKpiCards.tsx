"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { computeDelta, formatCount, useAnalytics } from "./use-analytics";

interface KpiPair {
  current: number;
  previous: number;
}

interface KpiResult {
  pageviews: KpiPair;
  visitors: KpiPair;
  sessions: KpiPair;
  pagesPerSession: KpiPair;
}

interface Props {
  endpoint: string;
  range: string;
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return null;
  if (value === 0 || !Number.isFinite(value)) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        0%
      </span>
    );
  }
  const positive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs ${
        positive
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-rose-600 dark:text-rose-400"
      }`}
    >
      {positive ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowDown className="h-3 w-3" />
      )}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function Tile({
  title,
  current,
  previous,
  format,
}: {
  title: string;
  current: number;
  previous: number;
  format: (v: number) => string;
}) {
  const delta = computeDelta(current, previous);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-2xl font-semibold tabular-nums">
            {format(current)}
          </div>
          <Delta value={delta} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          vs. previous period: {format(previous)}
        </p>
      </CardContent>
    </Card>
  );
}

function Skeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          —
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold text-muted-foreground">—</div>
      </CardContent>
    </Card>
  );
}

export function TrafficKpiCards({ endpoint, range }: Props) {
  const { data, loading, error } = useAnalytics<KpiResult>(endpoint, range);

  if (loading || !data) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton />
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-rose-500">
          Failed to load KPIs: {error}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Tile
        title="Pageviews"
        current={data.pageviews.current}
        previous={data.pageviews.previous}
        format={formatCount}
      />
      <Tile
        title="Unique Visitors"
        current={data.visitors.current}
        previous={data.visitors.previous}
        format={formatCount}
      />
      <Tile
        title="Sessions"
        current={data.sessions.current}
        previous={data.sessions.previous}
        format={formatCount}
      />
      <Tile
        title="Pages / Session"
        current={data.pagesPerSession.current}
        previous={data.pagesPerSession.previous}
        format={(v) => v.toFixed(2)}
      />
    </div>
  );
}
