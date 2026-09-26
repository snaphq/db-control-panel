import { auth } from "@repo/auth/server";
import {
  type BillingMiddlewareResult,
  checkBillingPermission,
} from "@repo/billing";
import {
  createUpgradeCheckout,
  createWorkspaceCheckout,
} from "@repo/billing/stripe/checkout";
import { resolveTenantFromHost } from "@repo/database";
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
 * POST /api/billing/checkout
 * Create a new Stripe checkout session
 *
 * For new workspaces:
 * - Creates a pending organization
 * - Creates checkout session with trial (default)
 * - Returns checkout URL
 *
 * For upgrades:
 * - Requires orgId and billing permissions
 * - Creates checkout session for existing org
 * - Returns checkout URL
 */
export async function POST(request: Request) {
  try {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({
      headers: requestHeaders,
    });
    const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
    if (!tenant) {
      return NextResponse.json({ error: "Unknown tenant" }, { status: 404 });
    }

    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      priceId,
      workspaceName,
      workspaceSlug,
      orgId,
      withTrial = true,
      successUrl,
      cancelUrl,
    } = body;

    // Validate required fields
    if (!priceId) {
      return NextResponse.json(
        { error: "priceId is required" },
        { status: 400 },
      );
    }

    // Determine if this is a new workspace or upgrade
    if (orgId) {
      // Upgrade flow - check billing permissions
      const permissionCheck = await checkBillingPermission(
        session.user.id,
        orgId,
      );
      if (!permissionCheck.allowed) {
        return createErrorResponse(permissionCheck);
      }

      const result = await createUpgradeCheckout({
        orgId,
        priceId,
        userEmail: session.user.email,
        withTrial,
        successUrl,
        cancelUrl,
      });

      return NextResponse.json({
        checkoutUrl: result.checkoutUrl,
        sessionId: result.sessionId,
      });
    }

    // New workspace flow
    if (!workspaceName || !workspaceSlug) {
      return NextResponse.json(
        {
          error:
            "workspaceName and workspaceSlug are required for new workspaces",
        },
        { status: 400 },
      );
    }

    const result = await createWorkspaceCheckout({
      priceId,
      workspaceName,
      workspaceSlug,
      tenantId: tenant.id,
      userId: session.user.id,
      userEmail: session.user.email,
      withTrial,
      successUrl,
      cancelUrl,
    });

    return NextResponse.json({
      checkoutUrl: result.checkoutUrl,
      pendingOrgId: result.pendingOrgId,
      sessionId: result.sessionId,
    });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create checkout session", message },
      { status: 500 },
    );
  }
}
