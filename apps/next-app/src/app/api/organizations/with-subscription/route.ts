import { resourceUrlForRequest } from "@/lib/agent-auth/discovery";
import {
  auth,
  getBetterAuthServer,
  runWithAuthTenantContext,
} from "@repo/auth/server";
import { ORG_STATUS, TRIAL_DURATION_DAYS } from "@repo/billing/constants";
import { stripe } from "@repo/billing/stripe/client";
import { and, db, eq, resolveTenantFromHost } from "@repo/database";
import { orgBilling, organization } from "@repo/database/schema";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

interface Body {
  name?: string;
  slug?: string;
  priceId?: string;
  customerId?: string;
  paymentMethodId?: string;
  withTrial?: boolean;
}

export async function POST(request: Request) {
  const requestHeaders = await headers();
  const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
  if (!tenant) {
    return NextResponse.json({ error: "Unknown tenant host" }, { status: 404 });
  }
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    name,
    slug,
    priceId,
    customerId,
    paymentMethodId,
    withTrial = true,
  } = body;

  if (!name?.trim() || !slug?.trim()) {
    return NextResponse.json(
      { error: "name and slug are required" },
      { status: 400 },
    );
  }
  if (!priceId) {
    return NextResponse.json({ error: "priceId is required" }, { status: 400 });
  }
  if (!customerId || !paymentMethodId) {
    return NextResponse.json(
      { error: "customerId and paymentMethodId are required" },
      { status: 400 },
    );
  }

  try {
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const server = getBetterAuthServer();
    const createdOrg = await runWithAuthTenantContext(
      {
        tenantId: tenant.id,
        resource: resourceUrlForRequest(request),
      },
      () =>
        server.getAuthInstance().api.createOrganization({
          body: { name: name.trim(), slug: slug.trim() },
          headers: requestHeaders,
        }),
    );

    if (!createdOrg?.id) {
      throw new Error("Failed to create organization");
    }

    const orgId = createdOrg.id;

    await db()
      .update(organization)
      .set({ stripeCustomerId: customerId, status: ORG_STATUS.ACTIVE })
      .where(
        and(eq(organization.id, orgId), eq(organization.tenantId, tenant.id)),
      );

    await stripe.customers.update(customerId, {
      metadata: {
        organizationId: orgId,
        organizationName: name.trim(),
        userId: session.user.id,
      },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      default_payment_method: paymentMethodId,
      trial_period_days: withTrial ? TRIAL_DURATION_DAYS : undefined,
      metadata: { organizationId: orgId, userId: session.user.id },
    });

    const item = subscription.items.data[0];
    const { nanoid } = await import("nanoid");
    await db()
      .insert(orgBilling)
      .values({
        id: nanoid(),
        organizationId: orgId,
        planTier: "pro",
        planStatus: withTrial ? "trialing" : "active",
        stripeSubscriptionId: subscription.id,
        stripeProductId:
          typeof item?.price.product === "string"
            ? item.price.product
            : item?.price.product?.id,
        stripePriceId: priceId,
        trialEndsAt: subscription.trial_end
          ? new Date(subscription.trial_end * 1000)
          : null,
        currentPeriodStart: subscription.current_period_start
          ? new Date(subscription.current_period_start * 1000)
          : null,
        currentPeriodEnd: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : null,
      })
      .onConflictDoUpdate({
        target: orgBilling.organizationId,
        set: {
          planTier: "pro",
          planStatus: withTrial ? "trialing" : "active",
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceId,
        },
      });

    return NextResponse.json({
      organization: { id: orgId, slug: slug.trim() },
      subscriptionId: subscription.id,
      status: subscription.status,
    });
  } catch (error) {
    console.error("with-subscription failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create workspace", message },
      { status: 500 },
    );
  }
}
