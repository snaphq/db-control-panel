import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const IMAGE_EXTENSION_REGEX = /\.(jpe?g|png|webp)(\?.*)?$/i;
const RESERVED_METADATA_KEYS = new Set([
  "created_by",
  "created_at",
  "updated_by",
  "updated_at",
]);

export interface Product {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  images: string[];
  metadata: Record<string, string>;
  statement_descriptor?: string | null;
  unit_label?: string | null;
  features?: { name?: string }[];
  created: number;
  updated: number;
}

export type PriceType = "one_time" | "recurring";
export type BillingInterval = "day" | "week" | "month" | "year";

export interface InitialPriceInput {
  type: PriceType;
  amount: number;
  currency: string;
  billingPeriod?: BillingInterval;
  intervalCount?: number;
  description?: string;
}

interface NormalizedInitialPrice {
  type: PriceType;
  unitAmount: number;
  currency: string;
  billingPeriod?: BillingInterval;
  intervalCount?: number;
  description?: string;
}

interface BaseProductInput {
  description?: string | null;
  active?: boolean;
  images?: string[];
  metadata?: Record<string, string>;
  statementDescriptor?: string | null;
  unitLabel?: string | null;
  marketingFeatures?: string[];
  initialPrice?: InitialPriceInput;
}

export interface CreateProductInput extends BaseProductInput {
  name: string;
}

export interface UpdateProductInput extends BaseProductInput {
  name?: string;
}

type NormalizedProductInput = Omit<
  CreateProductInput,
  | "initialPrice"
  | "metadata"
  | "statementDescriptor"
  | "unitLabel"
  | "marketingFeatures"
> & {
  metadata?: Record<string, string>;
  statementDescriptor?: string | null;
  unitLabel?: string | null;
  marketingFeatures?: string[];
  images?: string[];
  initialPrice?: NormalizedInitialPrice;
};

const QUERY_KEY = "products";

function normalizeAndValidateProductInput(
  data: CreateProductInput,
  options?: { isUpdate?: false },
): NormalizedProductInput;
function normalizeAndValidateProductInput(
  data: UpdateProductInput,
  options: { isUpdate: true },
): Partial<NormalizedProductInput>;
function normalizeAndValidateProductInput(
  data: CreateProductInput | UpdateProductInput,
  options?: { isUpdate?: boolean },
): NormalizedProductInput | Partial<NormalizedProductInput> {
  const normalized: Partial<NormalizedProductInput> = {};
  const isUpdate = options?.isUpdate ?? false;

  const trimmedName = data.name?.trim();
  if (!isUpdate || trimmedName) {
    if (!trimmedName) {
      throw new Error("Product name is required");
    }
    normalized.name = trimmedName;
  }

  if (data.description !== undefined) {
    const trimmedDescription = data.description?.trim();
    normalized.description = trimmedDescription ? trimmedDescription : null;
  }

  if (data.active !== undefined) {
    normalized.active = data.active;
  }

  if (data.images) {
    const sanitizedImages = data.images
      .filter(Boolean)
      .map((url) => url.trim())
      .filter(Boolean);

    if (sanitizedImages.length > 1) {
      throw new Error("Only one product image can be attached.");
    }

    if (
      sanitizedImages.some(
        (url) => !IMAGE_EXTENSION_REGEX.test(url.toLowerCase()),
      )
    ) {
      throw new Error("Image must be a JPEG, PNG, or WEBP URL.");
    }

    normalized.images = sanitizedImages.length ? sanitizedImages : [];
  }

  if (data.metadata) {
    const normalizedMetadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(data.metadata)) {
      const trimmedKey = key.trim();
      const trimmedValue = value.trim();
      if (!trimmedKey || !trimmedValue) {
        continue;
      }

      if (RESERVED_METADATA_KEYS.has(trimmedKey)) {
        continue;
      }

      normalizedMetadata[trimmedKey] = trimmedValue;
    }

    if (Object.keys(normalizedMetadata).length > 0) {
      normalized.metadata = normalizedMetadata;
    }
  }

  if (data.statementDescriptor !== undefined) {
    if (data.statementDescriptor === null || data.statementDescriptor === "") {
      normalized.statementDescriptor = null;
    } else {
      const trimmedDescriptor = data.statementDescriptor.trim();
      if (trimmedDescriptor.length < 5 || trimmedDescriptor.length > 22) {
        throw new Error(
          "Statement descriptor must be between 5 and 22 characters.",
        );
      }

      if (/[^0-9A-Z* .]/i.test(trimmedDescriptor)) {
        throw new Error(
          "Statement descriptor can only include letters, numbers, spaces, *, or .",
        );
      }

      normalized.statementDescriptor = trimmedDescriptor.toUpperCase();
    }
  }

  if (data.unitLabel !== undefined) {
    if (data.unitLabel === null || data.unitLabel === "") {
      normalized.unitLabel = null;
    } else {
      const trimmedUnitLabel = data.unitLabel.trim();
      if (!trimmedUnitLabel) {
        throw new Error("Unit label cannot be empty.");
      }
      if (trimmedUnitLabel.length > 12) {
        throw new Error("Unit label must be 12 characters or fewer.");
      }
      normalized.unitLabel = trimmedUnitLabel;
    }
  }

  if (data.marketingFeatures) {
    const features = data.marketingFeatures
      .map((feature) => feature.trim())
      .filter(Boolean);

    if (features.length > 8) {
      throw new Error("You can add up to 8 marketing features.");
    }

    normalized.marketingFeatures = features;
  }

  if (data.initialPrice) {
    const {
      amount,
      currency,
      type,
      billingPeriod,
      intervalCount,
      description,
    } = data.initialPrice;

    if (!amount || Number.isNaN(amount) || amount <= 0) {
      throw new Error("Price amount must be greater than 0.");
    }

    if (amount > 999_999.99) {
      throw new Error(
        "Maximum supported amount is $999,999.99. Please enter a lower price.",
      );
    }

    if (!currency || currency.trim().length !== 3) {
      throw new Error("Currency must be a valid 3-letter ISO code.");
    }

    if (type === "recurring" && !billingPeriod) {
      throw new Error("Billing period is required for recurring prices.");
    }

    if (
      type === "recurring" &&
      intervalCount !== undefined &&
      intervalCount < 1
    ) {
      throw new Error("Interval count must be at least 1.");
    }

    normalized.initialPrice = {
      type,
      unitAmount: Math.round(amount * 100),
      currency: currency.trim().toLowerCase(),
      billingPeriod: type === "recurring" ? billingPeriod : undefined,
      intervalCount: type === "recurring" ? intervalCount || 1 : undefined,
      description: description?.trim() || undefined,
    };
  }

  return normalized;
}

export function useProducts(filters?: {
  active?: boolean;
  search?: string;
  limit?: number;
}) {
  return useQuery<Product[]>({
    queryKey: [QUERY_KEY, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.active !== undefined) {
        params.set("active", String(filters.active));
      }
      if (filters?.search) {
        params.set("search", filters.search);
      }
      if (filters?.limit) {
        params.set("limit", String(filters.limit));
      }

      const queryString = params.toString();
      const url =
        queryString.length > 0
          ? `/api/admin/stripe/products?${queryString}`
          : "/api/admin/stripe/products";

      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch products");
      }
      return response.json();
    },
  });
}

export function useProduct(productId?: string) {
  return useQuery<Product>({
    queryKey: [QUERY_KEY, productId],
    queryFn: async () => {
      if (!productId) throw new Error("Product ID is required");

      const response = await fetch(`/api/admin/stripe/products/${productId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch product");
      }
      return response.json();
    },
    enabled: !!productId,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation<Product, Error, CreateProductInput>({
    mutationFn: async (data) => {
      const payload = normalizeAndValidateProductInput(data);

      const response = await fetch("/api/admin/stripe/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create product");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success("Product created successfully!");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create product");
    },
  });
}

export function useUpdateProduct(productId: string) {
  const queryClient = useQueryClient();

  return useMutation<Product, Error, UpdateProductInput>({
    mutationFn: async (data) => {
      const payload = normalizeAndValidateProductInput(data, {
        isUpdate: true,
      });

      const response = await fetch(`/api/admin/stripe/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update product");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, productId] });
      toast.success("Product updated successfully!");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update product");
    },
  });
}

export function useArchiveProduct() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (productId) => {
      const response = await fetch(`/api/admin/stripe/products/${productId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to archive product");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success("Product archived successfully!");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to archive product");
    },
  });
}
