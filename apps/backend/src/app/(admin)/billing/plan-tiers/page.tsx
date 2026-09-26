import { PlanTiersManager } from "@/components/admin/billing/plan-tiers-manager";
import { db } from "@repo/database";
import { planTier } from "@repo/database/schema";

export const dynamic = "force-dynamic";

export default async function PlanTiersPage() {
  const tiers = await db().select().from(planTier);
  tiers.sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">Plan Tiers</h1>
        <p className="text-muted-foreground">
          Manage plan tier display names. The <code>key</code> is referenced by
          <code className="ml-1">org_billing.plan_tier</code>; the display name
          is what end users see (e.g. "Pro", "Business").
        </p>
      </div>
      <PlanTiersManager initialTiers={tiers} />
    </div>
  );
}
