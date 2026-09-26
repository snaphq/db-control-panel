"use client";

import { ChartCard } from "./ChartCard";
import { formatCount, useAnalytics } from "./use-analytics";

interface FunnelStep {
  label: string;
  count: number;
  conversionFromPrev: number;
  conversionFromStart: number;
  dropoff: number;
}

interface FunnelResult {
  steps: FunnelStep[];
  overall: number;
}

interface Props {
  endpoint: string;
  range: string;
  title: string;
  description?: string;
}

function formatPct(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

export function FunnelChart({ endpoint, range, title, description }: Props) {
  const { data, loading, error } = useAnalytics<FunnelResult>(endpoint, range);
  const empty =
    !!data && (data.steps.length === 0 || data.steps[0].count === 0);
  const overall = data ? formatPct(data.overall) : undefined;

  return (
    <ChartCard
      title={title}
      description={description}
      total={overall}
      loading={loading}
      empty={empty}
      error={error}
    >
      {data && data.steps.length > 0 ? (
        <ol className="space-y-3">
          {data.steps.map((step, idx) => {
            const widthPct = step.conversionFromStart * 100;
            return (
              <li key={`${step.label}-${idx}`} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate font-medium">
                    {idx + 1}. {step.label}
                  </span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {formatCount(step.count)}
                    {idx > 0 ? (
                      <span
                        className={
                          step.conversionFromPrev >= 0.5
                            ? "ml-2 text-emerald-600 dark:text-emerald-400"
                            : "ml-2 text-rose-600 dark:text-rose-400"
                        }
                      >
                        {formatPct(step.conversionFromPrev)}
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.max(widthPct, 0)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </ChartCard>
  );
}
