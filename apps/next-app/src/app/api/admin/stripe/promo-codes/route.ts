import { auth } from "@repo/auth/server";
import { stripe } from "@repo/billing/stripe/client";
import type { Stripe } from "@repo/billing/stripe/client";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { getErrorMessage } from "@repo/core/error-utils";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

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

    const promoCodeData: Stripe.PromotionCodeCreateParams = {
      code: body.code,
      coupon: body.coupon,
      active: body.active ?? true,
    };

    if (body.max_redemptions) {
      promoCodeData.max_redemptions = body.max_redemptions;
    }

    if (body.expires_at) {
      promoCodeData.expires_at = body.expires_at;
    }

    if (body.restrictions) {
      promoCodeData.restrictions = body.restrictions;
    }

    promoCodeData.metadata = {
      created_by: session.user.email || session.user.id,
      created_at: new Date().toISOString(),
    };

    const promotionCode = await stripe.promotionCodes.create(promoCodeData);

    revalidatePath("/adminx/stripe/promo-codes");
    return NextResponse.json(promotionCode);
  } catch (error: unknown) {
    console.error("Error creating promo code:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
