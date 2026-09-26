"use client";

import type { BillingInterval, PriceType } from "@/hooks/stripe/useProducts";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/ui/components/ui/accordion";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { cn } from "@repo/ui/lib/utils";
import { Loader2, Plus, X } from "lucide-react";
import type { FormEvent } from "react";

export interface MetadataEntry {
  id: string;
  key: string;
  value: string;
  isReserved?: boolean;
}

interface ProductFormViewProps {
  mode: "create" | "edit";
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  name: string;
  onNameChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  active: boolean;
  onActiveChange: (value: boolean) => void;
  imageUrl: string;
  onImageUrlChange: (value: string) => void;
  onClearImage: () => void;
  imageError: string | null;
  isImageLoading: boolean;
  isImagePreviewReady: boolean;
  statementDescriptor: string;
  onStatementDescriptorChange: (value: string) => void;
  unitLabel: string;
  onUnitLabelChange: (value: string) => void;
  metadataEntries: MetadataEntry[];
  onAddMetadata: () => void;
  onMetadataChange: (id: string, field: "key" | "value", value: string) => void;
  onRemoveMetadata: (id: string) => void;
  marketingFeatures: string[];
  newFeature: string;
  onNewFeatureChange: (value: string) => void;
  onAddFeature: () => void;
  onRemoveFeature: (feature: string) => void;
  enableInitialPrice: boolean;
  onEnableInitialPriceChange: (value: boolean) => void;
  priceType: PriceType;
  onPriceTypeChange: (value: PriceType) => void;
  priceAmount: string;
  onPriceAmountChange: (value: string) => void;
  priceCurrency: string;
  onPriceCurrencyChange: (value: string) => void;
  priceInterval: BillingInterval;
  onPriceIntervalChange: (value: BillingInterval) => void;
  priceIntervalCount: string;
  onPriceIntervalCountChange: (value: string) => void;
  priceDescription: string;
  onPriceDescriptionChange: (value: string) => void;
  priceError: string | null;
}

const currencyOptions = [
  { label: "USD - US Dollar", value: "usd" },
  { label: "EUR - Euro", value: "eur" },
  { label: "GBP - British Pound", value: "gbp" },
  { label: "CAD - Canadian Dollar", value: "cad" },
  { label: "AUD - Australian Dollar", value: "aud" },
];

const billingIntervals: { label: string; value: BillingInterval }[] = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Year", value: "year" },
];

export function ProductFormView({
  mode,
  isSubmitting,
  onSubmit,
  onCancel,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  active,
  onActiveChange,
  imageUrl,
  onImageUrlChange,
  onClearImage,
  imageError,
  isImageLoading,
  isImagePreviewReady,
  statementDescriptor,
  onStatementDescriptorChange,
  unitLabel,
  onUnitLabelChange,
  metadataEntries,
  onAddMetadata,
  onMetadataChange,
  onRemoveMetadata,
  marketingFeatures,
  newFeature,
  onNewFeatureChange,
  onAddFeature,
  onRemoveFeature,
  enableInitialPrice,
  onEnableInitialPriceChange,
  priceType,
  onPriceTypeChange,
  priceAmount,
  onPriceAmountChange,
  priceCurrency,
  onPriceCurrencyChange,
  priceInterval,
  onPriceIntervalChange,
  priceIntervalCount,
  onPriceIntervalCountChange,
  priceDescription,
  onPriceDescriptionChange,
  priceError,
}: ProductFormViewProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Product Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g., Premium Plan"
              required
              maxLength={250}
            />
            <p className="text-xs text-muted-foreground">
              Appears at checkout.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Describe your product..."
              rows={4}
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="active"
              checked={active}
              onChange={(e) => onActiveChange(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="active" className="cursor-pointer">
              Active (product is available for purchase)
            </Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="image">Product media</Label>
            <div className="flex items-center gap-2">
              <Input
                id="image"
                type="url"
                value={imageUrl}
                onChange={(e) => onImageUrlChange(e.target.value)}
                placeholder="https://cdn.yourdomain.com/product.png"
                className={cn(
                  "flex-1",
                  imageError &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
              <Button
                type="button"
                variant="ghost"
                className="w-28 shrink-0"
                onClick={onClearImage}
                disabled={!imageUrl.trim()}
              >
                Remove
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              JPEG, PNG or WEBP. Appears at checkout.
            </p>
            {imageError && (
              <p className="text-xs text-destructive">{imageError}</p>
            )}
            {isImageLoading && (
              <p className="text-xs text-muted-foreground">Validating image…</p>
            )}
            {isImagePreviewReady && !imageError && (
              <div className="flex items-center gap-4 pt-2">
                <img
                  src={imageUrl}
                  alt={name || "Product media"}
                  className="h-20 w-20 rounded border object-cover"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Advanced settings</CardTitle>
          <p className="text-sm text-muted-foreground">
            Open the sections you need and add details for checkout, metadata,
            and pricing.
          </p>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="space-y-4">
            <AccordionItem value="descriptor">
              <AccordionTrigger>Statement descriptor</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  <Label htmlFor="statementDescriptor">
                    Statement descriptor
                  </Label>
                  <Input
                    id="statementDescriptor"
                    value={statementDescriptor}
                    onChange={(e) =>
                      onStatementDescriptorChange(e.target.value)
                    }
                    maxLength={22}
                    placeholder="YOUR BRAND*PLAN"
                  />
                  <p className="text-xs text-muted-foreground">
                    Overrides default descriptors. Only used for subscription
                    payments. Choose something your customers will recognise on
                    their bank statement.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="unitLabel">
              <AccordionTrigger>Unit label</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  <Label htmlFor="unitLabel">Unit label</Label>
                  <Input
                    id="unitLabel"
                    value={unitLabel}
                    onChange={(e) => onUnitLabelChange(e.target.value)}
                    maxLength={12}
                    placeholder="seats"
                  />
                  <p className="text-xs text-muted-foreground">
                    Adding a unit label describes how you sell your product.
                    Unit labels appear in receipts, invoices, Checkout, and the
                    customer portal.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="metadata">
              <AccordionTrigger>Metadata</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Store additional, structured information. Add more key/value
                    pairs as needed.
                  </p>
                  <div className="space-y-2">
                    {metadataEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="grid grid-cols-[1fr_1fr_auto] gap-2"
                      >
                        <Input
                          value={entry.key}
                          onChange={(e) =>
                            onMetadataChange(entry.id, "key", e.target.value)
                          }
                          placeholder="Key"
                          disabled={entry.isReserved}
                        />
                        <Input
                          value={entry.value}
                          onChange={(e) =>
                            onMetadataChange(entry.id, "value", e.target.value)
                          }
                          placeholder="Value"
                          disabled={entry.isReserved}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => onRemoveMetadata(entry.id)}
                          aria-label="Remove metadata row"
                          disabled={entry.isReserved}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={onAddMetadata}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add metadata
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="features">
              <AccordionTrigger>Marketing feature list</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    A list of product features that will be visible to
                    customers. Displayed in pricing tables.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={newFeature}
                      onChange={(e) => onNewFeatureChange(e.target.value)}
                      placeholder="e.g., Priority support"
                      maxLength={80}
                    />
                    <Button
                      type="button"
                      onClick={onAddFeature}
                      disabled={
                        !newFeature.trim() || marketingFeatures.length >= 8
                      }
                    >
                      Add
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {marketingFeatures.map((feature) => (
                      <div
                        key={feature}
                        className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                      >
                        <span>{feature}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => onRemoveFeature(feature)}
                          aria-label={`Remove ${feature}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {!marketingFeatures.length && (
                      <p className="text-xs text-muted-foreground">
                        No features added yet.
                      </p>
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {mode === "create" && (
              <AccordionItem value="pricing">
                <AccordionTrigger>Pricing (optional)</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <input
                        id="enablePrice"
                        type="checkbox"
                        checked={enableInitialPrice}
                        onChange={(e) =>
                          onEnableInitialPriceChange(e.target.checked)
                        }
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <Label htmlFor="enablePrice">
                        Add an initial price for this product
                      </Label>
                    </div>

                    {enableInitialPrice && (
                      <div className="space-y-4 rounded border p-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="priceAmount">Amount *</Label>
                            <Input
                              id="priceAmount"
                              type="number"
                              step="0.01"
                              min="0"
                              value={priceAmount}
                              onChange={(e) =>
                                onPriceAmountChange(e.target.value)
                              }
                              placeholder="9.99"
                              className={cn(
                                priceError &&
                                  "border-destructive focus-visible:ring-destructive",
                              )}
                            />
                            {priceError && (
                              <p className="text-xs text-destructive">
                                {priceError}
                              </p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="priceCurrency">Currency *</Label>
                            <select
                              id="priceCurrency"
                              value={priceCurrency}
                              onChange={(e) =>
                                onPriceCurrencyChange(e.target.value)
                              }
                              className="h-10 w-full rounded border px-3"
                            >
                              {currencyOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Billing type *</Label>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="radio"
                                value="one_time"
                                checked={priceType === "one_time"}
                                onChange={() => onPriceTypeChange("one_time")}
                                className="h-4 w-4"
                              />
                              One-off
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="radio"
                                value="recurring"
                                checked={priceType === "recurring"}
                                onChange={() => onPriceTypeChange("recurring")}
                                className="h-4 w-4"
                              />
                              Recurring
                            </label>
                          </div>
                        </div>

                        {priceType === "recurring" && (
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="priceInterval">
                                Billing period *
                              </Label>
                              <select
                                id="priceInterval"
                                value={priceInterval}
                                onChange={(e) =>
                                  onPriceIntervalChange(
                                    e.target.value as BillingInterval,
                                  )
                                }
                                className="h-10 w-full rounded border px-3"
                              >
                                {billingIntervals.map((interval) => (
                                  <option
                                    key={interval.value}
                                    value={interval.value}
                                  >
                                    {interval.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="priceIntervalCount">
                                Interval count *
                              </Label>
                              <Input
                                id="priceIntervalCount"
                                type="number"
                                min="1"
                                value={priceIntervalCount}
                                onChange={(e) =>
                                  onPriceIntervalCountChange(e.target.value)
                                }
                              />
                            </div>
                          </div>
                        )}

                        <div className="space-y-2">
                          <Label htmlFor="priceDescription">
                            Price description
                          </Label>
                          <Input
                            id="priceDescription"
                            value={priceDescription}
                            onChange={(e) =>
                              onPriceDescriptionChange(e.target.value)
                            }
                            placeholder="e.g., Standard monthly price"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "create" ? "Create Product" : "Update Product"}
        </Button>
      </div>
    </form>
  );
}
