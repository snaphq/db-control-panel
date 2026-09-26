import { getAdminSession } from "@/lib/admin-auth";
import { addOrgFeatureOverride, removeOrgFeatureOverride } from "@repo/billing";
import { db } from "@repo/database";
import { eq } from "@repo/database";
import { orgFeatures, organization } from "@repo/database/schema";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/org-features?orgId=xxx
 * Get all feature overrides for a specific organization
 *
 * Query params:
 * - orgId: Optional filter by organization ID
 *
 * Returns:
 * - Array of org feature overrides
 */
export async function GET(request: Request) {
  try {
    const session = await getAdminSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("orgId");

    if (orgId) {
      // Get features for specific org with org details
      const features = await db()
        .select()
        .from(orgFeatures)
        .where(eq(orgFeatures.organizationId, orgId))
        .orderBy(orgFeatures.featureKey);

      const org = await db()
        .select()
        .from(organization)
        .where(eq(organization.id, orgId))
        .limit(1);

      return NextResponse.json({
        organization: org[0] || null,
        features,
      });
    }

    // Get all org features grouped by organization
    const features = await db()
      .select()
      .from(orgFeatures)
      .orderBy(orgFeatures.organizationId, orgFeatures.featureKey);

    return NextResponse.json(features);
  } catch (error) {
    console.error("Error fetching org features:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/org-features
 * Create or update an org feature override
 *
 * Body:
 * - orgId: Organization ID
 * - featureKey: Feature identifier (e.g., "max_members")
 * - featureValue: Feature value (string)
 * - reason: Optional reason for the override
 * - expiresAt: Optional ISO date string for expiration
 */
export async function POST(request: Request) {
  try {
    const session = await getAdminSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { orgId, featureKey, featureValue, reason, expiresAt } = body;

    if (!orgId || !featureKey || featureValue === undefined) {
      return NextResponse.json(
        { error: "orgId, featureKey, and featureValue are required" },
        { status: 400 },
      );
    }

    // Verify organization exists
    const org = await db()
      .select()
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);

    if (!org[0]) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    await addOrgFeatureOverride({
      orgId,
      featureKey,
      featureValue: String(featureValue),
      reason,
      grantedBy: session.user.id,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error setting org feature override:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/org-features
 * Delete an org feature override
 *
 * Body:
 * - orgId: Organization ID
 * - featureKey: Feature identifier to delete
 */
export async function DELETE(request: Request) {
  try {
    const session = await getAdminSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { orgId, featureKey } = body;

    if (!orgId || !featureKey) {
      return NextResponse.json(
        { error: "orgId and featureKey are required" },
        { status: 400 },
      );
    }

    await removeOrgFeatureOverride(orgId, featureKey);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting org feature override:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
