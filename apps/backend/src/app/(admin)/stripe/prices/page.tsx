// import { Button } from "@repo/ui/components/ui/button";
// import Link from "next/link";
// import { Plus } from "lucide-react";
import { PriceTable } from "@/components/admin/stripe/PriceTable";
import { getStripePrices } from "@repo/billing/stripe/queries";

type PriceTableRows = Parameters<typeof PriceTable>[0]["prices"];

export default async function PricesPage() {
  const prices = (await getStripePrices({ limit: 100 })) as PriceTableRows;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">Prices</h1>
          <p className="text-muted-foreground">
            View and manage prices across your products
          </p>
        </div>
        {/* <Button asChild>
          <Link href="/stripe/prices/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Price
          </Link>
        </Button> */}
      </div>

      <PriceTable prices={prices} />
    </div>
  );
}
