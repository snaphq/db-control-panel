import { ProductForm } from "@/components/admin/stripe/ProductForm";

export default function NewProductPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">Create Product</h1>
        <p className="text-muted-foreground">
          Add a new product to your Stripe account
        </p>
      </div>
      <ProductForm mode="create" />
    </div>
  );
}
