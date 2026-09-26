"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Point {
  date: string;
  position: number | null;
}

export function KeywordPositionChart({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-12 text-center">
        No snapshots yet — the weekly cron will populate this chart.
      </div>
    );
  }

  // Lower position number is better → invert Y axis so the line goes up when
  // ranking improves.
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#e5e7eb"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          fontSize={11}
          stroke="#6b7280"
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          reversed
          fontSize={11}
          stroke="#6b7280"
          tickLine={false}
          axisLine={false}
          domain={[1, "dataMax + 5"]}
          allowDecimals={false}
          width={32}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 6 }}
          formatter={(value: unknown) =>
            value === null ? "Not ranking" : `#${value}`
          }
        />
        <Line
          type="monotone"
          dataKey="position"
          stroke="#2563eb"
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
