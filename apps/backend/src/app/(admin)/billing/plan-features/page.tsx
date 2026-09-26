import { PlanFeaturesManager } from "@/components/admin/billing";
import { getStripeProducts } from "@repo/billing/stripe/queries";

interface Product {
  id: string;
  name: string;
  active: boolean;
}

export default async function PlanFeaturesPage() {
  const products = await getStripeProducts();

  // Transform products to expected shape
  const formattedProducts: Product[] = (products || []).map((p) => ({
    id: String(p.id),
    name: String(p.name || "Unnamed Product"),
    active: Boolean(p.active),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">Plan Features</h1>
        <p className="text-muted-foreground">
          Configure features included in each pricing tier (Stripe product).
        </p>
      </div>
      <PlanFeaturesManager products={formattedProducts} />
    </div>
  );
}
