"use client";

import { parseRange } from "@repo/analytics/admin-range";
import { AnalyticsRangeSelector } from "@repo/react-ui/components/analytics/AnalyticsRangeSelector";
import { DonutSnapshotChart } from "@repo/react-ui/components/analytics/DonutSnapshotChart";
import { HorizontalBarSnapshot } from "@repo/react-ui/components/analytics/HorizontalBarSnapshot";
import { LineSeriesChart } from "@repo/react-ui/components/analytics/LineSeriesChart";
import { RevenueChart } from "@repo/react-ui/components/analytics/RevenueChart";
import { SignupsChart } from "@repo/react-ui/components/analytics/SignupsChart";
import { TopOrgsChart } from "@repo/react-ui/components/analytics/TopOrgsChart";
import { useSearchParams } from "next/navigation";

const SERIES = "/api/admin/analytics/series";
const SNAPSHOT = "/api/admin/analytics/snapshot";

export function DashboardCharts() {
  const searchParams = useSearchParams();
  const range = parseRange(searchParams.get("range"));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Analytics</h2>
        <AnalyticsRangeSelector value={range} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SignupsChart endpoint={`${SERIES}/signups`} range={range} />
        <RevenueChart endpoint={`${SERIES}/revenue`} range={range} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <LineSeriesChart
          endpoint={`${SERIES}/workspaces`}
          range={range}
          title="New workspaces"
        />
        <LineSeriesChart
          endpoint={`${SERIES}/sessions`}
          range={range}
          title="Active users"
          description="Distinct sessions per bucket"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <DonutSnapshotChart
          endpoint={`${SNAPSHOT}/org-status`}
          range={range}
          title="Workspace status"
        />
        <HorizontalBarSnapshot
          endpoint={`${SNAPSHOT}/plan-distribution`}
          range={range}
          title="Plan distribution"
        />
      </div>

      <TopOrgsChart endpoint={`${SNAPSHOT}/top-orgs`} range={range} />
    </div>
  );
}
