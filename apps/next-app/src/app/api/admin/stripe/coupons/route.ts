import { auth } from "@repo/auth/server";
import { stripe } from "@repo/billing/stripe/client";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { getErrorMessage } from "@repo/core/error-utils";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const couponSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[A-Z0-9_-]+$/),
    name: z.string().optional(),
    percent_off: z.number().int().min(1).max(100).optional(),
    amount_off: z.number().int().positive().optional(),
    currency: z.string().length(3).optional(),
    duration: z.enum(["once", "repeating", "forever"]),
    duration_in_months: z.number().int().positive().optional(),
    max_redemptions: z.number().int().positive().optional(),
    redeem_by: z.number().int().optional(),
    metadata: z.record(z.string()).optional(),
    applies_to: z
      .object({
        products: z.array(z.string()).nonempty(),
      })
      .optional(),
  })
  .refine(
    (data) => {
      return !!(data.percent_off || data.amount_off);
    },
    {
      message: "Either percent_off or amount_off must be provided",
    },
  )
  .refine(
    (data) => {
      if (data.amount_off) return !!data.currency;
      return true;
    },
    {
      message: "Currency is required when amount_off is set",
    },
  )
  .refine(
    (data) => {
      if (data.duration === "repeating") return !!data.duration_in_months;
      return true;
    },
    {
      message: "duration_in_months is required when duration is 'repeating'",
    },
  );

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
    console.log("Received body in API:", JSON.stringify(body, null, 2)); // Debug log
    const validatedData = couponSchema.parse(body);

    console.log(
      "Validated Data for Stripe:",
      JSON.stringify(validatedData, null, 2),
    ); // Debug log

    console.log(
      "Stripe Create Payload:",
      JSON.stringify(
        {
          id: validatedData.id,
          name: validatedData.name,
          percent_off: validatedData.percent_off,
          amount_off: validatedData.amount_off,
          currency: validatedData.currency,
          duration: validatedData.duration,
          duration_in_months: validatedData.duration_in_months,
          applies_to: validatedData.applies_to,
          max_redemptions: validatedData.max_redemptions,
          redeem_by: validatedData.redeem_by,
          metadata: {
            created_by: session.user.email || session.user.id,
            created_at: new Date().toISOString(),
            ...validatedData.metadata,
          },
        },
        null,
        2,
      ),
    );

    const coupon = await stripe.coupons.create({
      id: validatedData.id,
      name: validatedData.name,
      percent_off: validatedData.percent_off,
      amount_off: validatedData.amount_off,
      currency: validatedData.currency,
      duration: validatedData.duration,
      duration_in_months: validatedData.duration_in_months,
      applies_to: validatedData.applies_to,
      max_redemptions: validatedData.max_redemptions,
      redeem_by: validatedData.redeem_by,
      metadata: {
        created_by: session.user.email || session.user.id,
        created_at: new Date().toISOString(),
        ...validatedData.metadata,
      },
    });

    revalidatePath("/adminx/stripe/coupons");
    return NextResponse.json(coupon);
  } catch (error: unknown) {
    console.error("Error creating coupon:", error);

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
