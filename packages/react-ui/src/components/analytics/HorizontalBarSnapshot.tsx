"use client";

import type { SnapshotItem } from "@repo/analytics";
import { ChartCard } from "./ChartCard";
import { formatCount, useAnalytics } from "./use-analytics";

interface Props {
  endpoint: string;
  range: string;
  title: string;
  description?: string;
}

interface Result {
  items: SnapshotItem[];
  total: number;
}

export function HorizontalBarSnapshot({
  endpoint,
  range,
  title,
  description,
}: Props) {
  const { data, loading, error } = useAnalytics<Result>(endpoint, range);
  const total = data ? formatCount(data.total) : undefined;
  const empty = !!data && data.items.length === 0;
  const max = data ? data.items.reduce((m, i) => Math.max(m, i.value), 0) : 0;

  return (
    <ChartCard
      title={title}
      description={description}
      total={total}
      loading={loading}
      empty={empty}
      error={error}
    >
      {data ? (
        <ul className="space-y-2">
          {data.items.map((item) => {
            const pct = max > 0 ? (item.value / max) * 100 : 0;
            return (
              <li key={item.label}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate capitalize">{item.label}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatCount(item.value)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </ChartCard>
  );
}
