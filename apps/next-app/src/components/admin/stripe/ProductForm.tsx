"use client";

import type { Stripe } from "@repo/billing/stripe/client";
import {
  type BillingInterval,
  type PriceType,
  useCreateProduct,
  useUpdateProduct,
} from "@repo/ui/hooks/stripe/useProducts";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { type MetadataEntry, ProductFormView } from "./ProductFormView";

interface ProductFormProps {
  product?: Stripe.Product;
  mode: "create" | "edit";
}

const RESERVED_METADATA_KEYS = new Set([
  "created_by",
  "created_at",
  "updated_by",
  "updated_at",
]);

const IMAGE_EXTENSION_REGEX = /\.(jpe?g|png|webp)(\?.*)?$/i;

interface ProductPayload {
  name: string;
  description: string | null;
  active: boolean;
  images?: string[];
  metadata?: Record<string, string>;
  statementDescriptor?: string | null;
  unitLabel?: string | null;
  marketingFeatures?: string[];
  initialPrice?: {
    type: PriceType;
    amount: number;
    currency: string;
    billingPeriod?: BillingInterval;
    intervalCount?: number;
    description?: string;
  };
}

function createEntryId() {
  return Math.random().toString(36).slice(2, 10);
}

function sanitizeMetadata(
  entries: MetadataEntry[],
): Record<string, string> | undefined {
  const result: Record<string, string> = {};

  for (const { key, value, isReserved } of entries) {
    if (isReserved) continue;
    if (!key.trim() || !value.trim()) continue;
    result[key.trim()] = value.trim();
  }

  return Object.keys(result).length ? result : undefined;
}

function validateImageUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "Only HTTP or HTTPS URLs are supported.";
    }

    if (!IMAGE_EXTENSION_REGEX.test(parsed.pathname)) {
      return "Image must end with .jpg, .jpeg, .png, or .webp.";
    }
  } catch {
    return "Enter a valid image URL.";
  }

  return null;
}

export function ProductForm({ product, mode }: ProductFormProps) {
  const router = useRouter();
  const createProductMutation = useCreateProduct();
  const updateProductMutation = useUpdateProduct(product?.id || "");

  const initialImage = product?.images?.[0] ?? "";
  const initialStatementDescriptor = product?.statement_descriptor ?? "";
  const initialUnitLabel = product?.unit_label ?? "";
  const initialMarketingFeatures = useMemo(() => {
    const features = product?.features ?? [];
    return features
      .map((feature) => feature.name?.trim())
      .filter((name): name is string => Boolean(name));
  }, [product?.features]);

  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [active, setActive] = useState(product?.active ?? true);
  const [imageUrl, setImageUrl] = useState(initialImage);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isImagePreviewReady, setIsImagePreviewReady] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [statementDescriptor, setStatementDescriptor] = useState(
    initialStatementDescriptor,
  );
  const [unitLabel, setUnitLabel] = useState(initialUnitLabel);
  const [metadataEntries, setMetadataEntries] = useState<MetadataEntry[]>(() =>
    Object.entries(product?.metadata ?? {}).map(([key, value]) => ({
      id: createEntryId(),
      key,
      value: String(value),
      isReserved: RESERVED_METADATA_KEYS.has(key),
    })),
  );
  const [marketingFeatures, setMarketingFeatures] = useState<string[]>(
    initialMarketingFeatures,
  );
  const [newFeature, setNewFeature] = useState("");
  const [enableInitialPrice, setEnableInitialPrice] = useState(false);
  const [priceType, setPriceType] = useState<PriceType>("recurring");
  const [priceAmount, setPriceAmount] = useState("");
  const [priceCurrency, setPriceCurrency] = useState("usd");
  const [priceInterval, setPriceInterval] = useState<BillingInterval>("month");
  const [priceIntervalCount, setPriceIntervalCount] = useState("1");
  const [priceDescription, setPriceDescription] = useState("");
  const [priceError, setPriceError] = useState<string | null>(null);

  const isSubmitting =
    mode === "create"
      ? createProductMutation.isPending
      : updateProductMutation.isPending;

  const handleAddMetadata = () => {
    setMetadataEntries((prev) => [
      ...prev,
      { id: createEntryId(), key: "", value: "" },
    ]);
  };

  const handleMetadataChange = (
    id: string,
    field: "key" | "value",
    value: string,
  ) => {
    setMetadataEntries((prev) =>
      prev.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry,
      ),
    );
  };

  const handleRemoveMetadata = (id: string) => {
    setMetadataEntries((prev) => prev.filter((entry) => entry.id !== id));
  };

  const handleAddFeature = () => {
    const trimmed = newFeature.trim();
    if (!trimmed) {
      toast.error("Enter a feature description before adding.");
      return;
    }
    if (marketingFeatures.includes(trimmed)) {
      toast.error("That feature is already listed.");
      return;
    }
    if (marketingFeatures.length >= 8) {
      toast.error("You can add up to 8 features only.");
      return;
    }
    setMarketingFeatures((prev) => [...prev, trimmed]);
    setNewFeature("");
  };

  const handleRemoveFeature = (feature: string) => {
    setMarketingFeatures((prev) => prev.filter((item) => item !== feature));
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const trimmed = imageUrl.trim();
    if (!trimmed) {
      setImageError(null);
      setIsImagePreviewReady(false);
      setIsImageLoading(false);
      return;
    }

    const validationError = validateImageUrl(trimmed);
    if (validationError) {
      setImageError(validationError);
      setIsImagePreviewReady(false);
      setIsImageLoading(false);
      return;
    }

    setImageError(null);
    setIsImageLoading(true);
    setIsImagePreviewReady(false);

    let isCancelled = false;
    const img = new Image();
    img.onload = () => {
      if (isCancelled) return;
      setIsImagePreviewReady(true);
      setIsImageLoading(false);
    };
    img.onerror = () => {
      if (isCancelled) return;
      setImageError("Unable to load image from this URL.");
      setIsImagePreviewReady(false);
      setIsImageLoading(false);
    };
    img.src = trimmed;

    return () => {
      isCancelled = true;
    };
  }, [imageUrl]);

  useEffect(() => {
    if (!enableInitialPrice) {
      setPriceError(null);
      return;
    }

    if (!priceAmount.trim()) {
      setPriceError("Enter an amount for the initial price.");
      return;
    }

    const parsed = Number(priceAmount);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setPriceError("Amount must be greater than 0.");
      return;
    }

    if (parsed > 999_999.99) {
      setPriceError(
        "Maximum supported amount is $999,999.99. Enter a smaller value.",
      );
      return;
    }

    setPriceError(null);
  }, [priceAmount, enableInitialPrice]);

  const buildPayload = () => {
    const metadata = sanitizeMetadata(metadataEntries);
    const trimmedImage = imageUrl.trim();

    const descriptorChanged =
      statementDescriptor !== initialStatementDescriptor;
    const unitLabelChanged = unitLabel !== initialUnitLabel;
    const marketingFeaturesChanged =
      mode === "create"
        ? marketingFeatures.length > 0
        : JSON.stringify(marketingFeatures) !==
          JSON.stringify(initialMarketingFeatures);
    const imageChanged = mode === "create" || trimmedImage !== initialImage;

    const payload: ProductPayload = {
      name,
      description: description || null,
      active,
    };

    if (imageChanged) {
      payload.images =
        trimmedImage && isImagePreviewReady && !imageError
          ? [trimmedImage]
          : [];
    }

    if (metadata) {
      payload.metadata = metadata;
    }

    if (descriptorChanged) {
      payload.statementDescriptor = statementDescriptor.trim()
        ? statementDescriptor.trim()
        : null;
    }

    if (unitLabelChanged) {
      payload.unitLabel = unitLabel.trim() ? unitLabel.trim() : null;
    }

    if (marketingFeaturesChanged) {
      payload.marketingFeatures = marketingFeatures;
    }

    if (mode === "create" && enableInitialPrice) {
      payload.initialPrice = {
        type: priceType,
        amount: Number(priceAmount),
        currency: priceCurrency,
        billingPeriod: priceType === "recurring" ? priceInterval : undefined,
        intervalCount:
          priceType === "recurring"
            ? Number(priceIntervalCount || "1")
            : undefined,
        description: priceDescription.trim()
          ? priceDescription.trim()
          : undefined,
      };
    }

    return payload;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (imageUrl.trim() && (imageError || !isImagePreviewReady)) {
      toast.error(imageError || "Please provide a valid product image URL.");
      return;
    }
    if (isImageLoading) {
      toast.error("Please wait for the image preview to finish loading.");
      return;
    }
    if (enableInitialPrice && priceError) {
      toast.error(priceError);
      return;
    }

    const payload = buildPayload();

    try {
      const result =
        mode === "create"
          ? await createProductMutation.mutateAsync(payload)
          : await updateProductMutation.mutateAsync(payload);

      await new Promise((resolve) => setTimeout(resolve, 400));

      router.push(`/adminx/stripe/products/${result.id}`);
      router.refresh();
    } catch (error) {
      // Errors are surfaced via the shared hooks/toasts.
      console.error(error);
    }
  };

  return (
    <ProductFormView
      mode={mode}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
      name={name}
      onNameChange={setName}
      description={description}
      onDescriptionChange={setDescription}
      active={active}
      onActiveChange={setActive}
      imageUrl={imageUrl}
      onImageUrlChange={setImageUrl}
      onClearImage={() => setImageUrl("")}
      imageError={imageError}
      isImageLoading={isImageLoading}
      isImagePreviewReady={isImagePreviewReady}
      statementDescriptor={statementDescriptor}
      onStatementDescriptorChange={setStatementDescriptor}
      unitLabel={unitLabel}
      onUnitLabelChange={setUnitLabel}
      metadataEntries={metadataEntries}
      onAddMetadata={handleAddMetadata}
      onMetadataChange={handleMetadataChange}
      onRemoveMetadata={handleRemoveMetadata}
      marketingFeatures={marketingFeatures}
      newFeature={newFeature}
      onNewFeatureChange={setNewFeature}
      onAddFeature={handleAddFeature}
      onRemoveFeature={handleRemoveFeature}
      enableInitialPrice={enableInitialPrice}
      onEnableInitialPriceChange={setEnableInitialPrice}
      priceType={priceType}
      onPriceTypeChange={setPriceType}
      priceAmount={priceAmount}
      onPriceAmountChange={setPriceAmount}
      priceCurrency={priceCurrency}
      onPriceCurrencyChange={setPriceCurrency}
      priceInterval={priceInterval}
      onPriceIntervalChange={setPriceInterval}
      priceIntervalCount={priceIntervalCount}
      onPriceIntervalCountChange={setPriceIntervalCount}
      priceDescription={priceDescription}
      onPriceDescriptionChange={setPriceDescription}
      priceError={priceError}
    />
  );
}
