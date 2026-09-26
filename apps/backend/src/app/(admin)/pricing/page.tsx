import { PricingPlansManager } from "@/components/admin/pricing/PricingPlansManager";
import { listPricingPlans } from "@repo/billing";

export const dynamic = "force-dynamic";

export default async function PricingAdminPage() {
  const plans = await listPricingPlans();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">Pricing Page</h1>
        <p className="text-muted-foreground">
          Manage the public pricing page. Edit display copy, Stripe price links,
          and feature bullets. Changes revalidate the pricing cache immediately.
        </p>
      </div>
      <PricingPlansManager initialPlans={plans} />
    </div>
  );
}
