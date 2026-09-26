"use client";

import type { SeriesResult } from "@repo/analytics";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "./ChartCard";
import {
  computeDelta,
  formatTick,
  formatUsd,
  useAnalytics,
} from "./use-analytics";

interface Props {
  endpoint: string;
  range: string;
  title?: string;
  description?: string;
}

export function RevenueChart({
  endpoint,
  range,
  title = "Revenue",
  description,
}: Props) {
  const { data, loading, error } = useAnalytics<SeriesResult>(endpoint, range);
  const total = data ? formatUsd(data.total) : undefined;
  const delta = data ? computeDelta(data.total, data.prevTotal) : null;
  const empty = !!data && data.total === 0;

  return (
    <ChartCard
      title={title}
      description={description}
      total={total}
      delta={delta}
      loading={loading}
      empty={empty}
      error={error}
    >
      {data ? (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.series}>
            <XAxis
              dataKey="date"
              stroke="#888888"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatTick}
              minTickGap={24}
            />
            <YAxis
              stroke="#888888"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(v) => formatUsd(Number(v))}
            />
            <Tooltip
              contentStyle={{ fontSize: 12 }}
              labelFormatter={formatTick}
              formatter={(v) => formatUsd(Number(v))}
            />
            <Bar
              dataKey="value"
              fill="currentColor"
              radius={[4, 4, 0, 0]}
              className="fill-primary"
            />
          </BarChart>
        </ResponsiveContainer>
      ) : null}
    </ChartCard>
  );
}
