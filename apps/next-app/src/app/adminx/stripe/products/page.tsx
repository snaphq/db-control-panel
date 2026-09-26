import { ProductTable } from "@/components/admin/stripe/ProductTable";
import type { Product } from "@repo/billing/stripe/client";
import { getStripeProducts } from "@repo/billing/stripe/queries";
import { Button } from "@repo/ui/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";

export default async function ProductsPage() {
  const products = await getStripeProducts();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">Products</h1>
          <p className="text-muted-foreground">
            Manage your Stripe products and services
          </p>
        </div>
        <Button asChild>
          <Link href="/adminx/stripe/products/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Product
          </Link>
        </Button>
      </div>
      <ProductTable products={products as Product[]} />
    </div>
  );
}
