"use client";

import { useProducts } from "@/hooks/stripe/useProducts";
import { Button } from "@repo/react-ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/react-ui/components/ui/card";
import { Input } from "@repo/react-ui/components/ui/input";
import { Label } from "@repo/react-ui/components/ui/label";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export function CouponForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { data: products = [], isLoading: productsLoading } = useProducts({
    active: true,
    limit: 100,
  });

  const [couponId, setCouponId] = useState("");
  const [name, setName] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">(
    "percent",
  );
  const [percentOff, setPercentOff] = useState("");
  const [amountOff, setAmountOff] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [duration, setDuration] = useState<"once" | "repeating" | "forever">(
    "once",
  );
  const [durationInMonths, setDurationInMonths] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [redeemBy, setRedeemBy] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [productToAdd, setProductToAdd] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const couponData: Record<string, unknown> = {
        id: couponId,
        name: name || undefined,
        duration,
      };

      if (discountType === "percent") {
        couponData.percent_off = Number.parseInt(percentOff);
      } else {
        couponData.amount_off = Math.round(Number.parseFloat(amountOff) * 100);
        couponData.currency = currency;
      }

      if (duration === "repeating") {
        couponData.duration_in_months = Number.parseInt(durationInMonths);
      }

      if (maxRedemptions) {
        couponData.max_redemptions = Number.parseInt(maxRedemptions);
      }

      if (redeemBy) {
        couponData.redeem_by = Math.floor(new Date(redeemBy).getTime() / 1000);
      }

      console.log("Selected products:", selectedProducts); // Debug log

      if (selectedProducts.length > 0) {
        couponData.applies_to = {
          products: selectedProducts,
        };
      }

      console.log("Coupon data being sent:", couponData); // Debug log

      const response = await fetch("/api/admin/stripe/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(couponData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create coupon");
      }

      const data = await response.json();

      toast.success("Coupon created successfully!");

      await new Promise((resolve) => setTimeout(resolve, 1000));

      router.push(`/stripe/coupons/${data.id}`);
      router.refresh();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create coupon";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddProduct = () => {
    if (!productToAdd) return;
    setSelectedProducts((prev) => [...prev, productToAdd]);
    setProductToAdd("");
  };

  const handleRemoveProduct = (productId: string) => {
    setSelectedProducts((prev) => prev.filter((id) => id !== productId));
  };

  const activeProducts = products.filter((product) => product.active ?? true);
  const availableProducts = activeProducts.filter(
    (product) => !selectedProducts.includes(product.id),
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Coupon Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="couponId">Coupon Code *</Label>
            <Input
              id="couponId"
              value={couponId}
              onChange={(e) => setCouponId(e.target.value.toUpperCase())}
              placeholder="SUMMER2024"
              required
              maxLength={40}
              pattern="[A-Z0-9_-]+"
            />
            <p className="text-xs text-muted-foreground">
              Only uppercase letters, numbers, underscores, and hyphens allowed
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name (optional)</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Summer Sale 2024"
            />
          </div>

          <div className="space-y-3">
            <Label>Apply to specific products</Label>
            <div className="flex gap-2">
              <select
                value={productToAdd}
                onChange={(e) => setProductToAdd(e.target.value)}
                disabled={productsLoading || availableProducts.length === 0}
                className="flex-1 rounded border p-2 h-10"
              >
                <option value="">
                  {availableProducts.length === 0 && selectedProducts.length > 0
                    ? "All selected products are already added"
                    : "Select a product"}
                </option>
                {availableProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                onClick={handleAddProduct}
                disabled={!productToAdd}
              >
                Add
              </Button>
            </div>
            {selectedProducts.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Coupon will only apply to these products:
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedProducts.map((productId) => {
                    const product =
                      products.find((p) => p.id === productId) || null;
                    return (
                      <div
                        key={productId}
                        className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
                      >
                        <span>{product?.name || productId}</span>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => handleRemoveProduct(productId)}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Leave empty to allow this coupon for all products.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Discount Type *</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="percent"
                  checked={discountType === "percent"}
                  onChange={() => setDiscountType("percent")}
                  className="h-4 w-4"
                />
                Percentage
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="amount"
                  checked={discountType === "amount"}
                  onChange={() => setDiscountType("amount")}
                  className="h-4 w-4"
                />
                Fixed Amount
              </label>
            </div>
          </div>

          {discountType === "percent" ? (
            <div className="space-y-2">
              <Label htmlFor="percentOff">Percentage Off *</Label>
              <Input
                id="percentOff"
                type="number"
                min="1"
                max="100"
                value={percentOff}
                onChange={(e) => setPercentOff(e.target.value)}
                placeholder="25"
                required
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amountOff">Amount Off *</Label>
                <Input
                  id="amountOff"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amountOff}
                  onChange={(e) => setAmountOff(e.target.value)}
                  placeholder="10.00"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency *</Label>
                <select
                  id="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full p-2 border rounded h-10"
                  required
                >
                  <option value="usd">USD</option>
                  <option value="eur">EUR</option>
                  <option value="gbp">GBP</option>
                  <option value="cad">CAD</option>
                  <option value="aud">AUD</option>
                </select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="duration">Duration *</Label>
            <select
              id="duration"
              value={duration}
              onChange={(e) =>
                setDuration(e.target.value as "once" | "repeating" | "forever")
              }
              className="w-full p-2 border rounded h-10"
              required
            >
              <option value="once">One time</option>
              <option value="repeating">Repeating</option>
              <option value="forever">Forever</option>
            </select>
          </div>

          {duration === "repeating" && (
            <div className="space-y-2">
              <Label htmlFor="durationInMonths">Duration in Months *</Label>
              <Input
                id="durationInMonths"
                type="number"
                min="1"
                value={durationInMonths}
                onChange={(e) => setDurationInMonths(e.target.value)}
                placeholder="3"
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="maxRedemptions">Max Redemptions (optional)</Label>
            <Input
              id="maxRedemptions"
              type="number"
              min="1"
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
              placeholder="Leave empty for unlimited"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="redeemBy">Expiration Date (optional)</Label>
            <Input
              id="redeemBy"
              type="date"
              value={redeemBy}
              onChange={(e) => setRedeemBy(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Coupon
        </Button>
      </div>
    </form>
  );
}
