import { PriceForm } from "@/components/admin/stripe/PriceForm";
import { getStripeProduct } from "@repo/billing/stripe/queries";
import { notFound } from "next/navigation";

export default async function NewPricePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getStripeProduct(id);

  if (!product) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">Add Price</h1>
        <p className="text-muted-foreground">
          Create a new price for this product
        </p>
      </div>
      <PriceForm
        productId={product.id as string}
        productName={product.name as string}
      />
    </div>
  );
}
