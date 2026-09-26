import { getAdminSession } from "@/lib/admin-auth";
import { stripe } from "@repo/billing/stripe/client";
import { getErrorMessage } from "@repo/core/error-utils";
import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getAdminSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const coupon = await stripe.coupons.retrieve(id);

    return NextResponse.json(coupon);
  } catch (error: unknown) {
    console.error("Error fetching coupon:", error);
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
    const session = await getAdminSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    await stripe.coupons.del(id);
    revalidatePath("/stripe/coupons");

    return NextResponse.json({
      success: true,
      message: "Coupon deleted successfully",
    });
  } catch (error: unknown) {
    console.error("Error deleting coupon:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
