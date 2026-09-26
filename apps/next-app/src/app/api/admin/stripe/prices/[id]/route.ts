import { auth } from "@repo/auth/server";
import { stripe } from "@repo/billing/stripe/client";
import type { Stripe } from "@repo/billing/stripe/client";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import {
  createErrorWithCode,
  getErrorCode,
  getErrorMessage,
} from "@repo/core/error-utils";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const priceUpdateSchema = z.object({
  nickname: z.string().optional(),
  metadata: z.record(z.string()).optional(),
  name: z.string().optional(),
  active: z.boolean().optional(),
  mode: z.enum(["basic", "replace"]).optional(),
  unitAmount: z.number().int().positive().optional(),
  currency: z.string().length(3).optional(),
  billingType: z.enum(["one_time", "recurring"]).optional(),
  interval: z.enum(["day", "week", "month", "year"]).optional(),
  intervalCount: z.number().int().positive().optional(),
  setAsDefault: z.boolean().optional(),
  productId: z.string().optional(),
});

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = await getSiteAdminStatus(session.user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const price = await stripe.prices.retrieve(id);

    return NextResponse.json(price);
  } catch (error: unknown) {
    console.error("Error fetching price:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = await getSiteAdminStatus(session.user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await req.json();
    const validatedData = priceUpdateSchema.parse(body);
    const price = await stripe.prices.retrieve(id);
    const productId =
      typeof price.product === "string"
        ? price.product
        : price.product?.id || validatedData.productId;
    const existingPriceName =
      validatedData.name?.trim() ||
      (price.metadata?.price_name as string | undefined) ||
      price.nickname ||
      price.id;
    const existingPricingModel =
      (price.metadata?.pricing_model as string | undefined) || null;

    if (validatedData.mode === "replace") {
      const recurringConfig =
        validatedData.billingType === "recurring"
          ? validatedData.interval && validatedData.intervalCount
            ? {
                interval: validatedData.interval,
                interval_count: validatedData.intervalCount,
              }
            : null
          : undefined;

      if (
        !productId ||
        validatedData.unitAmount === undefined ||
        !validatedData.currency ||
        !validatedData.billingType ||
        recurringConfig === null
      ) {
        return NextResponse.json(
          { error: "Missing billing configuration for replacement." },
          { status: 400 },
        );
      }

      const newPrice = await stripe.prices.create({
        product: productId,
        unit_amount: validatedData.unitAmount,
        currency: validatedData.currency,
        nickname: validatedData.nickname || price.nickname || undefined,
        active: validatedData.active ?? true,
        recurring: recurringConfig,
        metadata: {
          created_by: session.user.email || session.user.id,
          created_at: new Date().toISOString(),
          price_name: existingPriceName,
          pricing_model: existingPricingModel,
          replaced_price: price.id,
        },
      });

      await stripe.prices.update(id, {
        active: false,
        metadata: {
          updated_by: session.user.email || session.user.id,
          updated_at: new Date().toISOString(),
          replaced_by: newPrice.id,
        },
      });

      if (validatedData.setAsDefault && productId) {
        await stripe.products.update(productId, {
          default_price: newPrice.id,
        });
      }

      revalidatePath("/adminx/stripe/prices");
      if (productId) {
        revalidatePath(`/adminx/stripe/products/${productId}`);
      }

      return NextResponse.json({ status: "replaced", price: newPrice });
    }

    const metadata =
      validatedData.nickname ||
      validatedData.metadata ||
      validatedData.active !== undefined ||
      validatedData.name
        ? {
            updated_by: session.user.email || session.user.id,
            updated_at: new Date().toISOString(),
            price_name: existingPriceName,
            pricing_model: existingPricingModel,
            ...validatedData.metadata,
          }
        : undefined;

    const updatedPrice = await stripe.prices.update(id, {
      active: validatedData.active,
      nickname: validatedData.nickname,
      metadata,
    });

    if (validatedData.setAsDefault && productId) {
      await stripe.products.update(productId, { default_price: id });
    }

    revalidatePath("/adminx/stripe/prices");
    if (productId) {
      revalidatePath(`/adminx/stripe/products/${productId}`);
    }

    return NextResponse.json(updatedPrice);
  } catch (error: unknown) {
    console.error("Error updating price:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

async function deleteStripePrice(priceId: string) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe secret key is not configured");
  }

  const response = await fetch(`https://api.stripe.com/v1/prices/${priceId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
    },
  });

  const payload = await response.json();

  if (!response.ok) {
    const error = payload?.error ?? {};
    throw createErrorWithCode(
      typeof error.message === "string"
        ? error.message
        : "Failed to delete price",
      typeof error.code === "string" ? error.code : undefined,
    );
  }

  return payload;
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = await getSiteAdminStatus(session.user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const price = await stripe.prices.retrieve(id);
    const productId =
      typeof price.product === "string"
        ? price.product
        : (price.product as Stripe.Product | null)?.id;

    try {
      await deleteStripePrice(id);
    } catch (error: unknown) {
      if (
        getErrorCode(error) === "price_in_use" ||
        getErrorMessage(error, "").includes("Price has been used")
      ) {
        return NextResponse.json(
          {
            status: "in_use",
            reason:
              "This price has already been used in billing. Archive it instead of deleting.",
          },
          { status: 200 },
        );
      }

      throw error;
    }

    revalidatePath("/adminx/stripe/prices");
    if (productId) {
      revalidatePath(`/adminx/stripe/products/${productId}`);
    }

    return NextResponse.json({ status: "deleted" });
  } catch (error: unknown) {
    console.error("Error deleting price:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
