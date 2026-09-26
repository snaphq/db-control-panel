import { FunnelsManager } from "@/app/(admin)/analytics/funnels/(components)/FunnelsManager";
import { asc, db } from "@repo/database";
import { analyticsFunnel } from "@repo/database";

export const dynamic = "force-dynamic";

export default async function FunnelsPage() {
  const rows = await db()
    .select()
    .from(analyticsFunnel)
    .orderBy(asc(analyticsFunnel.orderIndex), asc(analyticsFunnel.createdAt));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">
          Page-flow funnels
        </h1>
        <p className="text-muted-foreground">
          Define ordered sequences of page paths. Each funnel measures how many
          sessions move from step to step in PostHog over the selected range.
          Funnels appear on the <strong>Traffic</strong> page.
        </p>
      </div>
      <FunnelsManager
        initial={rows.map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          description: r.description,
          steps: r.steps,
          orderIndex: r.orderIndex,
          updatedAt: r.updatedAt,
        }))}
      />
    </div>
  );
}
