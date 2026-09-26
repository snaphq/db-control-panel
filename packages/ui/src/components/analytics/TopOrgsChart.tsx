"use client";

import type { TopOrgItem } from "@repo/analytics";
import Link from "next/link";
import { ChartCard } from "./ChartCard";
import { formatUsd, useAnalytics } from "./use-analytics";

interface Props {
  endpoint: string;
  range: string;
  title?: string;
  description?: string;
  hrefBase?: string; // e.g. "/organizations"
}

interface Result {
  items: TopOrgItem[];
}

export function TopOrgsChart({
  endpoint,
  range,
  title = "Top organizations by revenue",
  description,
  hrefBase = "/organizations",
}: Props) {
  const { data, loading, error } = useAnalytics<Result>(endpoint, range);
  const empty = !!data && data.items.length === 0;
  const max = data ? data.items.reduce((m, i) => Math.max(m, i.revenue), 0) : 0;

  return (
    <ChartCard
      title={title}
      description={description}
      loading={loading}
      empty={empty}
      error={error}
    >
      {data ? (
        <ul className="space-y-2">
          {data.items.map((item) => {
            const pct = max > 0 ? (item.revenue / max) * 100 : 0;
            return (
              <li key={item.organizationId}>
                <Link
                  href={`${hrefBase}/${item.organizationId}`}
                  className="block rounded-md p-2 hover:bg-muted/50"
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{item.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatUsd(item.revenue)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </ChartCard>
  );
}
