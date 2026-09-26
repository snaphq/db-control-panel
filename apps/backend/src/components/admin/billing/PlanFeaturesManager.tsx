"use client";

import { FEATURE_DEFINITIONS } from "@repo/billing/constants";
import { Badge } from "@repo/react-ui/components/ui/badge";
import { Button } from "@repo/react-ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/react-ui/components/ui/dialog";
import { Input } from "@repo/react-ui/components/ui/input";
import { Label } from "@repo/react-ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/react-ui/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Product {
  id: string;
  name: string;
  active: boolean;
}

interface TierFeature {
  id: string;
  productId: string;
  featureKey: string;
  featureValue: string;
  createdAt: string;
  updatedAt: string;
}

interface PlanFeaturesManagerProps {
  products: Product[];
}

export function PlanFeaturesManager({ products }: PlanFeaturesManagerProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [features, setFeatures] = useState<TierFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newFeatureKey, setNewFeatureKey] = useState("");
  const [newFeatureValue, setNewFeatureValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Fetch features for selected product
  useEffect(() => {
    if (!selectedProductId) {
      setFeatures([]);
      return;
    }

    const fetchFeatures = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/plan-features?productId=${selectedProductId}`,
        );
        if (!res.ok) throw new Error("Failed to fetch features");
        const data = await res.json();
        setFeatures(data);
      } catch (error) {
        console.error("Error fetching features:", error);
        toast.error("Failed to load features");
      } finally {
        setLoading(false);
      }
    };

    fetchFeatures();
  }, [selectedProductId]);

  const handleAddFeature = async () => {
    if (!selectedProductId || !newFeatureKey || newFeatureValue === "") {
      toast.error("Please fill in all fields");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/plan-features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          featureKey: newFeatureKey,
          featureValue: newFeatureValue,
        }),
      });

      if (!res.ok) throw new Error("Failed to save feature");

      // Refresh features
      const featuresRes = await fetch(
        `/api/admin/plan-features?productId=${selectedProductId}`,
      );
      const data = await featuresRes.json();
      setFeatures(data);

      setDialogOpen(false);
      setNewFeatureKey("");
      setNewFeatureValue("");
      toast.success("Feature added successfully");
    } catch (error) {
      console.error("Error adding feature:", error);
      toast.error("Failed to add feature");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFeature = async (featureKey: string) => {
    if (!selectedProductId) return;

    try {
      const res = await fetch("/api/admin/plan-features", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          featureKey,
        }),
      });

      if (!res.ok) throw new Error("Failed to delete feature");

      setFeatures(features.filter((f) => f.featureKey !== featureKey));
      toast.success("Feature removed");
    } catch (error) {
      console.error("Error deleting feature:", error);
      toast.error("Failed to delete feature");
    }
  };

  const getFeatureDefinition = (key: string) => {
    return FEATURE_DEFINITIONS.find((f) => f.key === key);
  };

  const formatFeatureValue = (key: string, value: string) => {
    const def = getFeatureDefinition(key);
    if (def?.type === "boolean") {
      return value === "true" ? "Enabled" : "Disabled";
    }
    if (def?.type === "number") {
      return value === "-1" ? "Unlimited" : value;
    }
    return value;
  };

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  return (
    <div className="space-y-6">
      {/* Product Selector */}
      <div className="space-y-2">
        <Label>Select Product</Label>
        <Select value={selectedProductId} onValueChange={setSelectedProductId}>
          <SelectTrigger className="w-full max-w-md">
            <SelectValue placeholder="Choose a Stripe product..." />
          </SelectTrigger>
          <SelectContent>
            {products.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                <div className="flex items-center gap-2">
                  {product.name}
                  {!product.active && (
                    <Badge variant="secondary" className="text-xs">
                      Inactive
                    </Badge>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedProduct && (
          <p className="text-xs text-muted-foreground font-mono">
            {selectedProduct.id}
          </p>
        )}
      </div>

      {/* Features Table */}
      {selectedProductId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">
              Features for {selectedProduct?.name}
            </h3>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Feature
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Feature</DialogTitle>
                  <DialogDescription>
                    Configure a feature for this pricing tier.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Feature</Label>
                    <Select
                      value={newFeatureKey}
                      onValueChange={setNewFeatureKey}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a feature..." />
                      </SelectTrigger>
                      <SelectContent>
                        {FEATURE_DEFINITIONS.map((def) => (
                          <SelectItem key={def.key} value={def.key}>
                            <div>
                              <div>{def.label}</div>
                              <div className="text-xs text-muted-foreground">
                                {def.description}
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Value</Label>
                    {(() => {
                      const def = getFeatureDefinition(newFeatureKey);
                      if (def?.type === "boolean") {
                        return (
                          <Select
                            value={newFeatureValue}
                            onValueChange={setNewFeatureValue}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select value..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">Enabled</SelectItem>
                              <SelectItem value="false">Disabled</SelectItem>
                            </SelectContent>
                          </Select>
                        );
                      }
                      return (
                        <Input
                          type={def?.type === "number" ? "number" : "text"}
                          value={newFeatureValue}
                          onChange={(e) => setNewFeatureValue(e.target.value)}
                          placeholder={
                            def?.type === "number"
                              ? "Enter number (-1 for unlimited)"
                              : "Enter value"
                          }
                        />
                      );
                    })()}
                    {newFeatureKey && (
                      <p className="text-xs text-muted-foreground">
                        Default free value:{" "}
                        {String(
                          getFeatureDefinition(newFeatureKey)?.defaultFreeValue,
                        )}
                      </p>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleAddFeature} disabled={saving}>
                    {saving && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : features.length === 0 ? (
            <div className="rounded-md border p-8 text-center text-muted-foreground">
              No features configured for this product. Add features to define
              what this pricing tier includes.
            </div>
          ) : (
            <div className="rounded-md border">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Feature
                    </th>
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Value
                    </th>
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Key
                    </th>
                    <th className="h-12 px-4 text-right align-middle font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {features.map((feature) => {
                    const def = getFeatureDefinition(feature.featureKey);
                    return (
                      <tr key={feature.featureKey} className="border-b">
                        <td className="p-4 align-middle">
                          <div>
                            <div className="font-medium">
                              {def?.label || feature.featureKey}
                            </div>
                            {def?.description && (
                              <div className="text-xs text-muted-foreground">
                                {def.description}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-4 align-middle">
                          <Badge
                            variant={
                              def?.type === "boolean" &&
                              feature.featureValue === "true"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {formatFeatureValue(
                              feature.featureKey,
                              feature.featureValue,
                            )}
                          </Badge>
                        </td>
                        <td className="p-4 align-middle">
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {feature.featureKey}
                          </code>
                        </td>
                        <td className="p-4 align-middle text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              handleDeleteFeature(feature.featureKey)
                            }
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!selectedProductId && (
        <div className="rounded-md border p-8 text-center text-muted-foreground">
          Select a Stripe product above to manage its features.
        </div>
      )}
    </div>
  );
}
