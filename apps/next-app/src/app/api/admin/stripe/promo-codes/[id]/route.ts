import { auth } from "@repo/auth/server";
import { stripe } from "@repo/billing/stripe/client";
import type { Stripe } from "@repo/billing/stripe/client";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { getErrorMessage } from "@repo/core/error-utils";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

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
    const promotionCode = await stripe.promotionCodes.retrieve(id);

    return NextResponse.json(promotionCode);
  } catch (error: unknown) {
    console.error("Error fetching promo code:", error);
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

    const updateData: Stripe.PromotionCodeUpdateParams = {};

    if (body.active !== undefined) {
      updateData.active = body.active;
    }

    updateData.metadata = {
      updated_by: session.user.email || session.user.id,
      updated_at: new Date().toISOString(),
    };

    const promotionCode = await stripe.promotionCodes.update(id, updateData);

    revalidatePath("/adminx/stripe/promo-codes");
    return NextResponse.json(promotionCode);
  } catch (error: unknown) {
    console.error("Error updating promo code:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
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

    await stripe.promotionCodes.update(id, { active: false });
    revalidatePath("/adminx/stripe/promo-codes");

    return NextResponse.json({
      success: true,
      message: "Promo code deactivated successfully",
    });
  } catch (error: unknown) {
    console.error("Error deactivating promo code:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
