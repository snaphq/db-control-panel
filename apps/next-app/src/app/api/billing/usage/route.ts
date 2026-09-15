import { auth } from "@repo/auth/server";
import { canDowngradeToFree, getUsageSummary } from "@repo/billing";
import type { BillingUsageResponse } from "@repo/billing";
import { db, resolveTenantFromHost } from "@repo/database";
import { and, eq } from "@repo/database";
import { member, organization } from "@repo/database/schema";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

/**
 * GET /api/billing/usage?orgId=xxx
 * Get usage statistics for an organization
 *
 * Returns:
 * - usage: Current usage summary (members, projects with limits and percentages)
 * - canDowngradeToFree: Whether the workspace can downgrade to free tier
 * - downgradeBlockers: List of blockers preventing downgrade
 */
export async function GET(request: Request) {
  try {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({
      headers: requestHeaders,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
    if (!tenant) {
      return NextResponse.json({ error: "Unknown tenant" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("orgId");

    if (!orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 });
    }

    // Verify user is a member of the organization
    const membership = await db()
      .select({ id: member.id })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(
        and(
          eq(member.userId, session.user.id),
          eq(member.organizationId, orgId),
          eq(member.tenantId, tenant.id),
          eq(organization.tenantId, tenant.id),
        ),
      )
      .limit(1);

    if (!membership[0]) {
      return NextResponse.json(
        { error: "Not a member of this workspace" },
        { status: 403 },
      );
    }

    // Get usage information in parallel
    const [usage, downgradeCheck] = await Promise.all([
      getUsageSummary(orgId),
      canDowngradeToFree(orgId),
    ]);

    const response: BillingUsageResponse = {
      usage,
      canDowngradeToFree: downgradeCheck.canDowngrade,
      downgradeBlockers: downgradeCheck.blockers,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching usage:", error);
    return NextResponse.json(
      { error: "Failed to fetch usage information" },
      { status: 500 },
    );
  }
}
