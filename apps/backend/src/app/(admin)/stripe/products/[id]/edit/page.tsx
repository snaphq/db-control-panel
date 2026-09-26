import { ProductForm } from "@/components/admin/stripe/ProductForm";
import type { Stripe } from "@repo/billing/stripe/client";
import { getStripeProduct } from "@repo/billing/stripe/queries";
import { notFound } from "next/navigation";

export default async function EditProductPage({
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
        <h1 className="text-2xl font-normal tracking-tight">Edit Product</h1>
        <p className="text-muted-foreground">Update product information</p>
      </div>
      <ProductForm product={product as Stripe.Product} mode="edit" />
    </div>
  );
}
