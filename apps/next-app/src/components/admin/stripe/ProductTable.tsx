"use client";

import { ActionsMenu } from "@/components/admin/stripe/ActionsMenu";
import type { Product } from "@repo/billing/stripe/client";
import { Badge } from "@repo/ui/components/ui/badge";
import { Input } from "@repo/ui/components/ui/input";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ProductTableProps {
  products: Product[];
}

export function ProductTable({ products: initialProducts }: ProductTableProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [products] = useState(initialProducts);

  const filteredProducts = products.filter(
    (product) =>
      product.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="h-12 px-4 text-left align-middle font-medium">
                Product
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Description
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Status
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Created
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((product) => (
              <tr
                key={product.id}
                className="border-b transition-colors hover:bg-muted/50 cursor-pointer"
                onClick={() =>
                  router.push(`/adminx/stripe/products/${product.id}`)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    router.push(`/adminx/stripe/products/${product.id}`);
                  }
                }}
                tabIndex={0}
              >
                <td className="p-4 align-middle">
                  <div className="flex items-center gap-3">
                    {product.images && product.images.length > 0 ? (
                      <img
                        src={product.images[0]}
                        alt={product.name}
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                        No Image
                      </div>
                    )}
                    <div>
                      <div className="font-medium">{product.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {product.id}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="p-4 align-middle max-w-xs">
                  <p className="text-sm text-muted-foreground truncate">
                    {product.description || "No description"}
                  </p>
                </td>
                <td className="p-4 align-middle">
                  <Badge
                    variant={product.active ? "default" : "secondary"}
                    className={
                      product.active ? "bg-emerald-500 text-white" : ""
                    }
                  >
                    {product.active ? "Active" : "Archived"}
                  </Badge>
                </td>
                <td className="p-4 align-middle text-sm">
                  {formatDate(product.created)}
                </td>
                <td
                  className="p-4 align-middle"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                    }
                  }}
                >
                  <ActionsMenu
                    itemType="product"
                    itemId={product.id}
                    itemName={product.name}
                    viewUrl={`/adminx/stripe/products/${product.id}`}
                    editUrl={`/adminx/stripe/products/${product.id}/edit`}
                    stripeUrl={`https://dashboard.stripe.com/products/${product.id}`}
                    isActive={product.active}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredProducts.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No products found
          </div>
        )}
      </div>
    </div>
  );
}
