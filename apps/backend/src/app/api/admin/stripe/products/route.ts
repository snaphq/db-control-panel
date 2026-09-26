import { getAdminSession } from "@/lib/admin-auth";
import { stripe } from "@repo/billing/stripe/client";
import { getStripeProducts } from "@repo/billing/stripe/queries";
import { getErrorMessage } from "@repo/core/error-utils";
import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const marketingFeaturesSchema = z.array(z.string().min(1).max(80)).max(8);

const initialPriceSchema = z
  .object({
    type: z.enum(["one_time", "recurring"]),
    unitAmount: z.number().int().positive(),
    currency: z.string().length(3),
    billingPeriod: z.enum(["day", "week", "month", "year"]).optional(),
    intervalCount: z.number().int().min(1).optional(),
    description: z.string().max(80).optional(),
  })
  .refine((value) => value.type === "one_time" || !!value.billingPeriod, {
    message: "Billing period is required for recurring prices",
    path: ["billingPeriod"],
  });

const productSchema = z.object({
  name: z.string().min(1).max(250),
  description: z.string().nullable().optional(),
  active: z.boolean().optional(),
  images: z.array(z.string().url()).max(1).optional(),
  metadata: z.record(z.string()).optional(),
  statementDescriptor: z.string().min(5).max(22).nullable().optional(),
  unitLabel: z.string().min(1).max(12).nullable().optional(),
  marketingFeatures: marketingFeaturesSchema.optional(),
  initialPrice: initialPriceSchema.optional(),
});

const productQuerySchema = z.object({
  active: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  search: z.string().max(256).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getAdminSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const queryParams = productQuerySchema.safeParse({
      active: searchParams.get("active"),
      limit: searchParams.get("limit"),
      search: searchParams.get("search")?.trim() || undefined,
    });

    if (!queryParams.success) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: queryParams.error.errors,
        },
        { status: 400 },
      );
    }

    const active =
      queryParams.data.active === "true"
        ? true
        : queryParams.data.active === "false"
          ? false
          : undefined;

    // Preserve the established Stripe API response and ordering for existing
    // callers. The shared provider/DAL path is needed only for actual search.
    if (!queryParams.data.search) {
      const products = await stripe.products.list({
        active,
        limit: queryParams.data.limit || 100,
      });
      return NextResponse.json(products.data);
    }

    const products = await getStripeProducts({
      active,
      search: queryParams.data.search,
      limit: queryParams.data.limit || 100,
    });
    return NextResponse.json(products);
  } catch (error: unknown) {
    console.error("Error fetching products:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validatedData = productSchema.parse(body);

    let product = await stripe.products.create({
      name: validatedData.name,
      description: validatedData.description || undefined,
      active: validatedData.active ?? true,
      images: validatedData.images?.length ? validatedData.images : undefined,
      statement_descriptor: validatedData.statementDescriptor || undefined,
      unit_label: validatedData.unitLabel || undefined,
      features: validatedData.marketingFeatures
        ? validatedData.marketingFeatures.map((name) => ({ name }))
        : undefined,
      metadata: {
        created_by: session.user.email || session.user.id,
        created_at: new Date().toISOString(),
        ...validatedData.metadata,
      },
    });

    if (validatedData.initialPrice) {
      const billingPeriod = validatedData.initialPrice.billingPeriod;
      const defaultPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: validatedData.initialPrice.unitAmount,
        currency: validatedData.initialPrice.currency,
        recurring:
          validatedData.initialPrice.type === "recurring" && billingPeriod
            ? {
                interval: billingPeriod,
                interval_count: validatedData.initialPrice.intervalCount || 1,
              }
            : undefined,
        nickname: validatedData.initialPrice.description || undefined,
        metadata: {
          created_by: session.user.email || session.user.id,
          created_at: new Date().toISOString(),
          product_id: product.id,
        },
      });

      product = await stripe.products.update(product.id, {
        default_price: defaultPrice.id,
      });
    }

    revalidatePath("/stripe/products");

    return NextResponse.json(product);
  } catch (error: unknown) {
    console.error("Error creating product:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
