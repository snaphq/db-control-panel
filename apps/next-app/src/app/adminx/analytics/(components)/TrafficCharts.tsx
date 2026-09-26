"use client";

import { parseRange } from "@repo/analytics/admin-range";
import { AnalyticsRangeSelector } from "@repo/ui/components/analytics/AnalyticsRangeSelector";
import { DonutSnapshotChart } from "@repo/ui/components/analytics/DonutSnapshotChart";
import { FunnelChart } from "@repo/ui/components/analytics/FunnelChart";
import { HorizontalBarSnapshot } from "@repo/ui/components/analytics/HorizontalBarSnapshot";
import { LineSeriesChart } from "@repo/ui/components/analytics/LineSeriesChart";
import { TrafficKpiCards } from "@repo/ui/components/analytics/TrafficKpiCards";
import { Button } from "@repo/ui/components/ui/button";
import { Settings2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const SERIES = "/api/admin/analytics/posthog/series";
const SNAPSHOT = "/api/admin/analytics/posthog/snapshot";
const KPIS = "/api/admin/analytics/posthog/kpis";
const FUNNEL = "/api/admin/analytics/posthog/funnel";

interface FunnelMeta {
  id: string;
  name: string;
  description: string | null;
  stepCount: number;
}

interface Props {
  funnels: FunnelMeta[];
}

export function TrafficCharts({ funnels }: Props) {
  const searchParams = useSearchParams();
  const range = parseRange(searchParams.get("range"));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Overview</h2>
        <AnalyticsRangeSelector value={range} />
      </div>

      <TrafficKpiCards endpoint={KPIS} range={range} />

      <LineSeriesChart
        endpoint={`${SERIES}/pageviews`}
        range={range}
        title="Pageviews over time"
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Traffic Sources</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <DonutSnapshotChart
            endpoint={`${SNAPSHOT}/channels`}
            range={range}
            title="Channels"
            description="Sessions by acquisition channel (first pageview)"
          />
          <HorizontalBarSnapshot
            endpoint={`${SNAPSHOT}/referrers`}
            range={range}
            title="Top referring domains"
          />
          <HorizontalBarSnapshot
            endpoint={`${SNAPSHOT}/utm-campaigns`}
            range={range}
            title="Top UTM campaigns"
            description="Sessions per utm_campaign"
          />
          <HorizontalBarSnapshot
            endpoint={`${SNAPSHOT}/utm-source-medium`}
            range={range}
            title="UTM source / medium"
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Page-flow funnels</h2>
          <Button asChild size="sm" variant="outline">
            <Link href="/adminx/analytics/funnels">
              <Settings2 className="h-4 w-4 mr-2" />
              Manage funnels
            </Link>
          </Button>
        </div>
        {funnels.length === 0 ? (
          <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
            No funnels configured.{" "}
            <Link
              href="/adminx/analytics/funnels/new"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Create your first funnel
            </Link>{" "}
            to track how users move between pages.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {funnels.map((f) => (
              <FunnelChart
                key={f.id}
                endpoint={`${FUNNEL}/${f.id}`}
                range={range}
                title={f.name}
                description={f.description ?? `${f.stepCount} steps`}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Audience</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <HorizontalBarSnapshot
            endpoint={`${SNAPSHOT}/landing-pages`}
            range={range}
            title="Top landing pages"
            description="First pageview path per session"
          />
          <DonutSnapshotChart
            endpoint={`${SNAPSHOT}/device`}
            range={range}
            title="Device type"
          />
          <HorizontalBarSnapshot
            endpoint={`${SNAPSHOT}/countries`}
            range={range}
            title="Top countries"
          />
        </div>
      </section>
    </div>
  );
}
