"use client";

import type { SnapshotItem } from "@repo/analytics";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartCard } from "./ChartCard";
import { formatCount, useAnalytics } from "./use-analytics";

interface Props {
  endpoint: string;
  range: string;
  title: string;
  description?: string;
}

interface SnapshotResult {
  items: SnapshotItem[];
  total: number;
}

const COLORS = [
  "var(--chart-1, #3b82f6)",
  "var(--chart-2, #10b981)",
  "var(--chart-3, #f59e0b)",
  "var(--chart-4, #ef4444)",
  "var(--chart-5, #8b5cf6)",
  "var(--chart-6, #ec4899)",
];

export function DonutSnapshotChart({
  endpoint,
  range,
  title,
  description,
}: Props) {
  const { data, loading, error } = useAnalytics<SnapshotResult>(
    endpoint,
    range,
  );
  const total = data ? formatCount(data.total) : undefined;
  const empty = !!data && data.total === 0;

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
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="50%" height={220}>
            <PieChart>
              <Pie
                data={data.items}
                dataKey="value"
                nameKey="label"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {data.items.map((_, idx) => (
                  <Cell
                    key={idx.toString()}
                    fill={COLORS[idx % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="flex-1 space-y-1.5 text-xs">
            {data.items.map((item, idx) => (
              <li
                key={item.label}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-2 truncate">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: COLORS[idx % COLORS.length] }}
                  />
                  <span className="truncate capitalize">{item.label}</span>
                </span>
                <span className="font-medium">{formatCount(item.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </ChartCard>
  );
}
