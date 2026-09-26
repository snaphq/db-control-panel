import { TrafficCharts } from "@/app/(admin)/analytics/(components)/TrafficCharts";
import { assertPosthogConfigured } from "@repo/analytics/posthog-query";
import { asc, db } from "@repo/database";
import { analyticsFunnel } from "@repo/database";
import { Card, CardContent } from "@repo/react-ui/components/ui/card";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const cfg = assertPosthogConfigured();

  const funnels = await db()
    .select({
      id: analyticsFunnel.id,
      name: analyticsFunnel.name,
      description: analyticsFunnel.description,
      steps: analyticsFunnel.steps,
    })
    .from(analyticsFunnel)
    .orderBy(asc(analyticsFunnel.orderIndex), asc(analyticsFunnel.createdAt));

  const funnelMeta = funnels.map((f) => ({
    id: f.id,
    name: f.name,
    description: f.description,
    stepCount: Array.isArray(f.steps) ? f.steps.length : 0,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">Traffic</h1>
        <p className="text-muted-foreground">
          Live traffic stats sourced from PostHog. Use the range selector to
          change the window; data refreshes when you change it.
        </p>
      </div>

      {cfg.ok ? (
        <TrafficCharts funnels={funnelMeta} />
      ) : (
        <Card>
          <CardContent className="flex items-start gap-3 py-6 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
            <div className="space-y-1">
              <div className="font-medium">PostHog is not fully configured</div>
              <p className="text-muted-foreground">{cfg.reason}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
