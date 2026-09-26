import { auth } from "@repo/auth/server";
import { stripe } from "@repo/billing/stripe/client";
import type { Stripe } from "@repo/billing/stripe/client";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { getErrorMessage } from "@repo/core/error-utils";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const tierSchema = z.object({
  up_to: z.union([z.literal("inf"), z.number().int().positive()]),
  unit_amount: z.number().int().positive(),
});

const priceSchema = z.object({
  product: z.string().min(1),
  name: z.string().min(1),
  currency: z.string().length(3).toLowerCase(),
  billing_type: z.enum(["recurring", "one_time"]),
  interval: z.enum(["day", "week", "month", "year"]).optional(),
  interval_count: z.number().int().positive().optional(),
  pricing_model: z.enum(["flat", "package", "tiered", "usage"]),
  unit_amount: z.number().int().positive().optional(),
  nickname: z.string().optional(),
  lookup_key: z.string().optional(),
  active: z.boolean().optional(),
  tiers_mode: z.enum(["graduated", "volume"]).optional(),
  tiers: z.array(tierSchema).optional(),
  usage_type: z.enum(["licensed", "metered"]).optional(),
  aggregate_usage: z
    .enum(["sum", "last_during_period", "max", "last_ever"])
    .optional(),
  usage_meter: z.string().optional(),
  metadata: z.record(z.string()).optional(),
});

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const validatedData = priceSchema.parse(body);

    if (validatedData.billing_type === "recurring" && !validatedData.interval) {
      return NextResponse.json(
        { error: "Recurring prices must include an interval." },
        { status: 400 },
      );
    }

    if (
      validatedData.pricing_model === "usage" &&
      validatedData.billing_type !== "recurring"
    ) {
      return NextResponse.json(
        { error: "Usage-based pricing must be recurring." },
        { status: 400 },
      );
    }

    const metadata = {
      created_by: session.user.email || session.user.id,
      created_at: new Date().toISOString(),
      price_name: validatedData.name,
      pricing_model: validatedData.pricing_model,
      ...(validatedData.usage_meter
        ? { usage_meter: validatedData.usage_meter }
        : {}),
      ...validatedData.metadata,
    };

    const createParams: Stripe.PriceCreateParams = {
      product: validatedData.product,
      currency: validatedData.currency,
      nickname: validatedData.nickname || undefined,
      lookup_key: validatedData.lookup_key || undefined,
      active: validatedData.active ?? true,
      metadata,
    };

    if (validatedData.billing_type === "recurring") {
      const interval = validatedData.interval;

      if (!interval) {
        return NextResponse.json(
          { error: "Recurring prices must include an interval." },
          { status: 400 },
        );
      }

      createParams.recurring = {
        interval,
        interval_count: validatedData.interval_count ?? 1,
        usage_type:
          validatedData.pricing_model === "usage" ? "metered" : "licensed",
        aggregate_usage:
          validatedData.pricing_model === "usage"
            ? validatedData.aggregate_usage || "sum"
            : undefined,
      };
    }

    switch (validatedData.pricing_model) {
      case "flat":
      case "package":
      case "usage":
        if (!validatedData.unit_amount) {
          return NextResponse.json(
            { error: "Amount is required for this pricing model." },
            { status: 400 },
          );
        }
        createParams.unit_amount = validatedData.unit_amount;
        createParams.billing_scheme = "per_unit";
        break;
      case "tiered":
        if (!validatedData.tiers?.length || !validatedData.tiers_mode) {
          return NextResponse.json(
            { error: "Provide at least one tier and select a tier mode." },
            { status: 400 },
          );
        }
        createParams.billing_scheme = "tiered";
        createParams.tiers_mode = validatedData.tiers_mode;
        createParams.tiers = validatedData.tiers.map((tier) => ({
          up_to: tier.up_to === "inf" ? "inf" : tier.up_to,
          unit_amount: tier.unit_amount,
        }));
        break;
    }

    const price = await stripe.prices.create(createParams);

    revalidatePath("/adminx/stripe/prices");
    revalidatePath(`/adminx/stripe/products/${validatedData.product}`);

    return NextResponse.json(price);
  } catch (error: unknown) {
    console.error("Error creating price:", error);

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
