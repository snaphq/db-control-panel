"use client";

import type { SeriesResult } from "@repo/analytics";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "./ChartCard";
import {
  computeDelta,
  formatCount,
  formatTick,
  useAnalytics,
} from "./use-analytics";

interface Props {
  endpoint: string;
  range: string;
  title: string;
  description?: string;
}

export function LineSeriesChart({
  endpoint,
  range,
  title,
  description,
}: Props) {
  const { data, loading, error } = useAnalytics<SeriesResult>(endpoint, range);
  const total = data ? formatCount(data.total) : undefined;
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
          <LineChart data={data.series}>
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
              allowDecimals={false}
              width={32}
            />
            <Tooltip
              contentStyle={{ fontSize: 12 }}
              labelFormatter={formatTick}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="currentColor"
              strokeWidth={2}
              dot={false}
              className="text-primary"
            />
          </LineChart>
        </ResponsiveContainer>
      ) : null}
    </ChartCard>
  );
}
