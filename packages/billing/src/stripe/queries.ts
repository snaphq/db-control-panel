import { db } from "@repo/database";
import { sql } from "@repo/database";
import { planTier as planTierTable } from "@repo/database/schema";
import type { PricingTier } from "../types";
import { stripe } from "./client";

const STRIPE_SCHEMA = process.env.STRIPE_SCHEMA ?? "stripe";

function filterStripeProducts<
  T extends { description: string | null; name: string },
>(
  products: T[],
  search: string | undefined,
  limit: number | undefined,
  offset: number | undefined,
): T[] {
  const needle = search?.trim().toLowerCase();
  const filtered = needle
    ? products.filter(
        (product) =>
          product.name.toLowerCase().includes(needle) ||
          product.description?.toLowerCase().includes(needle),
      )
    : products;
  const start = Math.max(0, offset || 0);
  return filtered.slice(start, start + (limit || 100));
}

async function tableExists(
  tableName: string,
  schema: string = STRIPE_SCHEMA,
): Promise<boolean> {
  try {
    const result = await db().execute(
      sql`SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = ${schema} AND table_name = ${tableName}
      )`,
    );
    return (result.rows[0]?.exists as boolean) || false;
  } catch (error) {
    return false;
  }
}

export async function getStripeProducts(filters?: {
  active?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const hasTable = await tableExists("products");
  const search = filters?.search?.trim() || undefined;

  if (!hasTable) {
    console.warn(
      "stripe.products table does not exist. Fetching from Stripe API...",
    );
    try {
      const products = await stripe.products.list({
        active: filters?.active,
        limit: search ? 100 : filters?.limit || 100,
      });
      return filterStripeProducts(
        products.data,
        search,
        filters?.limit,
        filters?.offset,
      );
    } catch (error) {
      console.error("Error fetching from Stripe API:", error);
      return [];
    }
  }

  let query = sql`SELECT * FROM `
    .append(sql.raw(`${STRIPE_SCHEMA}.products`))
    .append(sql` WHERE 1=1`);

  if (filters?.active !== undefined) {
    query = sql`${query} AND active = ${filters.active}`;
  }

  if (search) {
    query = sql`${query} AND (name ILIKE ${`%${search}%`} OR description ILIKE ${`%${search}%`})`;
  }

  query = sql`${query} ORDER BY created ASC`;

  if (filters?.limit) {
    query = sql`${query} LIMIT ${filters.limit}`;
  }

  if (filters?.offset) {
    query = sql`${query} OFFSET ${filters.offset}`;
  }

  try {
    const result = await db().execute(query);
    return result.rows;
  } catch (error) {
    console.error("Error querying stripe.products:", error);
    const products = await stripe.products.list({
      active: filters?.active,
      limit: search ? 100 : filters?.limit || 100,
    });
    return filterStripeProducts(
      products.data,
      search,
      filters?.limit,
      filters?.offset,
    );
  }
}

export async function getStripeProduct(productId: string) {
  const hasTable = await tableExists("products");

  if (!hasTable) {
    try {
      const product = await stripe.products.retrieve(productId);
      return product;
    } catch (error) {
      console.error("Error fetching product from Stripe:", error);
      return null;
    }
  }

  try {
    const result = await db().execute(
      sql`SELECT * FROM `
        .append(sql.raw(`${STRIPE_SCHEMA}.products`))
        .append(sql` WHERE id = ${productId} LIMIT 1`),
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error("Error querying stripe.products:", error);
    try {
      const product = await stripe.products.retrieve(productId);
      return product;
    } catch (stripeError) {
      return null;
    }
  }
}

export async function getStripePrices(filters?: {
  active?: boolean;
  productId?: string;
  type?: string;
  limit?: number;
}) {
  const hasTable = await tableExists("prices");

  if (!hasTable) {
    try {
      const prices = await stripe.prices.list({
        active: filters?.active,
        product: filters?.productId,
        limit: filters?.limit || 100,
      });
      return prices.data;
    } catch (error) {
      console.error("Error fetching from Stripe API:", error);
      return [];
    }
  }

  let query = sql`SELECT * FROM `
    .append(sql.raw(`${STRIPE_SCHEMA}.prices`))
    .append(sql` WHERE 1=1`);

  if (filters?.active !== undefined) {
    query = sql`${query} AND active = ${filters.active}`;
  }

  if (filters?.productId) {
    query = sql`${query} AND product = ${filters.productId}`;
  }

  if (filters?.type) {
    query = sql`${query} AND type = ${filters.type}`;
  }

  query = sql`${query} ORDER BY created DESC`;

  if (filters?.limit) {
    query = sql`${query} LIMIT ${filters.limit}`;
  }

  try {
    const result = await db().execute(query);
    return result.rows;
  } catch (error) {
    console.error("Error querying stripe.prices:", error);
    const prices = await stripe.prices.list({
      active: filters?.active,
      product: filters?.productId,
      limit: filters?.limit || 100,
    });
    return prices.data;
  }
}

export async function getStripePricesForProduct(productId: string) {
  const hasTable = await tableExists("prices");

  if (!hasTable) {
    try {
      const prices = await stripe.prices.list({
        product: productId,
        limit: 100,
      });
      return prices.data;
    } catch (error) {
      console.error("Error fetching from Stripe API:", error);
      return [];
    }
  }

  try {
    const result = await db().execute(
      sql`SELECT * FROM `
        .append(sql.raw(`${STRIPE_SCHEMA}.prices`))
        .append(sql` WHERE product = ${productId} ORDER BY created DESC`),
    );
    return result.rows;
  } catch (error) {
    console.error("Error querying stripe.prices:", error);
    const prices = await stripe.prices.list({
      product: productId,
      limit: 100,
    });
    return prices.data;
  }
}

export async function getStripePrice(priceId: string) {
  const hasTable = await tableExists("prices");

  if (!hasTable) {
    try {
      const price = await stripe.prices.retrieve(priceId);
      return price;
    } catch (error) {
      return null;
    }
  }

  try {
    const result = await db().execute(
      sql`SELECT * FROM `
        .append(sql.raw(`${STRIPE_SCHEMA}.prices`))
        .append(sql` WHERE id = ${priceId} LIMIT 1`),
    );
    return result.rows[0] || null;
  } catch (error) {
    try {
      const price = await stripe.prices.retrieve(priceId);
      return price;
    } catch (stripeError) {
      return null;
    }
  }
}

export async function getStripeCoupons(filters?: {
  valid?: boolean;
  search?: string;
  limit?: number;
}) {
  try {
    const coupons = await stripe.coupons.list({
      limit: filters?.limit || 100,
    });
    return coupons.data;
  } catch (error) {
    console.error("Error fetching from Stripe API:", error);
    return [];
  }
}

export async function getStripeCoupon(couponId: string) {
  try {
    const coupon = await stripe.coupons.retrieve(couponId);
    return coupon;
  } catch (error) {
    return null;
  }
}

export async function getStripePromotionCodes(filters?: {
  active?: boolean;
  couponId?: string;
  limit?: number;
}) {
  try {
    const promoCodes = await stripe.promotionCodes.list({
      active: filters?.active,
      coupon: filters?.couponId,
      limit: filters?.limit || 100,
    });
    return promoCodes.data;
  } catch (error) {
    console.error("Error fetching from Stripe API:", error);
    return [];
  }
}

export async function getStripePromotionCode(promoCodeId: string) {
  try {
    const promoCode = await stripe.promotionCodes.retrieve(promoCodeId);
    return promoCode;
  } catch (error) {
    return null;
  }
}

// Types for pricing display
export type { PricingTier } from "../types";

// Default fallback pricing tiers when Stripe is not configured
const DEFAULT_PRICING_TIERS: PricingTier[] = [
  {
    id: "default-basic",
    name: "Basic",
    description: "Essential features you need to get started",
    monthlyPrice: 10,
    yearlyPrice: 100,
    monthlyPriceId: null,
    yearlyPriceId: null,
    features: [
      "Example Feature Number 1",
      "Example Feature Number 2",
      "Example Feature Number 3",
    ],
    popular: false,
    exclusive: false,
    displayOrder: 1,
    isContactPricing: false,
    actionLabel: "Get Started",
  },
  {
    id: "default-pro",
    name: "Pro",
    description: "Perfect for owners of small & medium businesses",
    monthlyPrice: 25,
    yearlyPrice: 250,
    monthlyPriceId: null,
    yearlyPriceId: null,
    features: [
      "Example Feature Number 1",
      "Example Feature Number 2",
      "Example Feature Number 3",
    ],
    popular: true,
    exclusive: false,
    displayOrder: 2,
    isContactPricing: false,
    actionLabel: "Get Started",
  },
  {
    id: "default-enterprise",
    name: "Enterprise",
    description: "Dedicated support and infrastructure to fit your needs",
    monthlyPrice: null,
    yearlyPrice: null,
    monthlyPriceId: null,
    yearlyPriceId: null,
    features: [
      "Example Feature Number 1",
      "Example Feature Number 2",
      "Example Feature Number 3",
      "Super Exclusive Feature",
    ],
    popular: false,
    exclusive: true,
    displayOrder: 3,
    isContactPricing: true,
    actionLabel: "Contact Sales",
  },
];

/**
 * Fetch pricing tiers for homepage display.
 *
 * Reads from the admin-managed `plan_tier` table (the M3 source of truth).
 * For each plan with a monthly/yearly Stripe price ID set, fetches the live
 * unit amount from Stripe (preferring the synced `stripe.prices` table).
 *
 * Falls back to DEFAULT_PRICING_TIERS if no plans are configured.
 */
export async function getPricingTiers(): Promise<PricingTier[]> {
  try {
    const plans = await db()
      .select()
      .from(planTierTable)
      .orderBy(planTierTable.sortOrder);

    const visible = plans.filter(
      (p) =>
        !p.hideFromPricing && (p.isPaid || p.isExclusive || p.key === "free"),
    );

    if (visible.length === 0) {
      console.warn(
        "No plan_tier rows configured. Using default pricing tiers.",
      );
      return DEFAULT_PRICING_TIERS;
    }

    const tiers = await Promise.all(
      visible.map(async (plan): Promise<PricingTier> => {
        const [monthlyAmount, yearlyAmount] = await Promise.all([
          plan.monthlyPriceId ? fetchPriceAmount(plan.monthlyPriceId) : null,
          plan.yearlyPriceId ? fetchPriceAmount(plan.yearlyPriceId) : null,
        ]);

        const isContactPricing =
          plan.isExclusive || (monthlyAmount === null && yearlyAmount === null);

        return {
          id: plan.id,
          name: plan.displayName,
          description: plan.description ?? "",
          monthlyPrice: monthlyAmount,
          yearlyPrice: yearlyAmount,
          monthlyPriceId: plan.monthlyPriceId,
          yearlyPriceId: plan.yearlyPriceId,
          features: plan.features ?? [],
          popular: plan.isPopular,
          exclusive: plan.isExclusive || isContactPricing,
          displayOrder: plan.sortOrder,
          isContactPricing,
          actionLabel:
            plan.actionLabel ||
            (isContactPricing ? "Contact Sales" : "Get Started"),
        };
      }),
    );

    return tiers;
  } catch (error) {
    console.error("Error fetching pricing tiers:", error);
    return DEFAULT_PRICING_TIERS;
  }
}

/**
 * Best-effort fetch of a Stripe price's unit amount in major units (dollars).
 * Returns null on any error; callers treat null as "contact pricing".
 */
async function fetchPriceAmount(priceId: string): Promise<number | null> {
  try {
    const price = await getStripePrice(priceId);
    if (!price) return null;
    const data = price as { unit_amount?: number | null; active?: boolean };
    if (data.active === false) return null;
    return data.unit_amount != null ? data.unit_amount / 100 : null;
  } catch {
    return null;
  }
}
