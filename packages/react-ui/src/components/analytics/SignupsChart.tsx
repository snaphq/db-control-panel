"use client";

import type { SeriesResult } from "@repo/analytics";
import {
  Area,
  AreaChart,
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
  title?: string;
  description?: string;
}

export function SignupsChart({
  endpoint,
  range,
  title = "Sign-ups",
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
          <AreaChart data={data.series}>
            <defs>
              <linearGradient id="signupsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.3} />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
              </linearGradient>
            </defs>
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
            <Area
              type="monotone"
              dataKey="value"
              stroke="currentColor"
              strokeWidth={2}
              fill="url(#signupsFill)"
              className="stroke-primary text-primary"
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : null}
    </ChartCard>
  );
}
