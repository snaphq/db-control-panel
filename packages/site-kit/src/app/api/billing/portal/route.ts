import { auth } from "@repo/auth/server";
import {
  type BillingMiddlewareResult,
  checkBillingPermission,
} from "@repo/billing";
import { createOrganizationPortalSession } from "@repo/billing/stripe/portal";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

function createErrorResponse(result: BillingMiddlewareResult): NextResponse {
  const error = result.error;
  if (!error)
    throw new Error("Cannot create error response from allowed result");
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.status },
  );
}

/**
 * POST /api/billing/portal
 * Create a Stripe billing portal session
 *
 * Requires:
 * - orgId: The organization ID
 * - User must have billing permissions (owner or billing_admin)
 *
 * Returns:
 * - portalUrl: URL to redirect the user to
 */
export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { orgId, returnUrl } = body;

    if (!orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 });
    }

    // Check billing permissions
    const permissionCheck = await checkBillingPermission(
      session.user.id,
      orgId,
    );
    if (!permissionCheck.allowed) {
      return createErrorResponse(permissionCheck);
    }

    const result = await createOrganizationPortalSession({
      orgId,
      returnUrl,
    });

    return NextResponse.json({
      portalUrl: result.portalUrl,
    });
  } catch (error) {
    console.error("Error creating portal session:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    // Handle specific errors
    if (message === "Organization not found") {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 },
      );
    }
    if (message === "Organization does not have a Stripe customer") {
      return NextResponse.json(
        { error: "This workspace does not have an active subscription" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to create billing portal session", message },
      { status: 500 },
    );
  }
}
