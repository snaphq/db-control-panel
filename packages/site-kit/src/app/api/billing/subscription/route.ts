import { auth } from "@repo/auth/server";
import {
  BILLING_MANAGEMENT_ROLES,
  getOrganizationPlan,
  getOrganizationStatus,
  getOrganizationTrialEndDate,
  isFreeTier,
  isOrganizationInTrial,
  isReadOnly,
} from "@repo/billing";
import type { BillingSubscriptionResponse } from "@repo/billing";
import { db, resolveTenantFromHost } from "@repo/database";
import { and, eq } from "@repo/database";
import { member, organization } from "@repo/database/schema";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

/**
 * GET /api/billing/subscription?orgId=xxx
 * Get subscription information for an organization
 *
 * Returns:
 * - plan: Current plan details (null if free tier)
 * - status: Organization status (active, readonly, pending, suspended)
 * - isFree: Whether on free tier
 * - isTrialing: Whether in trial period
 * - isReadOnly: Whether workspace is read-only
 * - trialEndsAt: Trial end date if trialing
 * - canManageBilling: Whether current user can manage billing
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
      .select({ role: member.role })
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

    // Get subscription and plan info in parallel
    const [plan, isFree, isTrialing, trialEndsAt, readOnly, status] =
      await Promise.all([
        getOrganizationPlan(orgId),
        isFreeTier(orgId),
        isOrganizationInTrial(orgId),
        getOrganizationTrialEndDate(orgId),
        isReadOnly(orgId),
        getOrganizationStatus(orgId),
      ]);

    // Check if user can manage billing
    const canManageBilling = BILLING_MANAGEMENT_ROLES.includes(
      membership[0].role as (typeof BILLING_MANAGEMENT_ROLES)[number],
    );

    const response: BillingSubscriptionResponse = {
      plan,
      status: status ?? "active",
      isFree,
      isTrialing,
      isReadOnly: readOnly,
      trialEndsAt: trialEndsAt?.toISOString(),
      canManageBilling,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching subscription:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription information" },
      { status: 500 },
    );
  }
}
