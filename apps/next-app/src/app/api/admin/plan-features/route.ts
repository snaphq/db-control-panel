import { auth } from "@repo/auth/server";
import { removeTierFeature, setTierFeature } from "@repo/billing";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { db } from "@repo/database";
import { eq } from "@repo/database";
import { pricingTierFeatures } from "@repo/database/schema";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/plan-features?productId=xxx
 * Get all features for a specific pricing tier (Stripe product)
 *
 * Query params:
 * - productId: Optional filter by product ID
 *
 * Returns:
 * - Array of tier features
 */
export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");

    let query = db().select().from(pricingTierFeatures);

    if (productId) {
      query = query.where(
        eq(pricingTierFeatures.productId, productId),
      ) as typeof query;
    }

    const features = await query.orderBy(pricingTierFeatures.productId);

    return NextResponse.json(features);
  } catch (error) {
    console.error("Error fetching tier features:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/plan-features
 * Create or update a tier feature
 *
 * Body:
 * - productId: Stripe product ID
 * - featureKey: Feature identifier (e.g., "max_members")
 * - featureValue: Feature value (string - will be parsed as needed)
 */
export async function POST(request: Request) {
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

    const body = await request.json();
    const { productId, featureKey, featureValue } = body;

    if (!productId || !featureKey || featureValue === undefined) {
      return NextResponse.json(
        { error: "productId, featureKey, and featureValue are required" },
        { status: 400 },
      );
    }

    await setTierFeature({
      productId,
      featureKey,
      featureValue: String(featureValue),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error setting tier feature:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/plan-features
 * Delete a tier feature
 *
 * Body:
 * - productId: Stripe product ID
 * - featureKey: Feature identifier to delete
 */
export async function DELETE(request: Request) {
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

    const body = await request.json();
    const { productId, featureKey } = body;

    if (!productId || !featureKey) {
      return NextResponse.json(
        { error: "productId and featureKey are required" },
        { status: 400 },
      );
    }

    await removeTierFeature(productId, featureKey);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting tier feature:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
