import { CouponForm } from "@/components/admin/stripe/CouponForm";

export default function NewCouponPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">Create Coupon</h1>
        <p className="text-muted-foreground">
          Add a new discount coupon to your Stripe account
        </p>
      </div>
      <CouponForm />
    </div>
  );
}
