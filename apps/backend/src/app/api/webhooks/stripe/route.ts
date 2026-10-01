import { handleCheckoutCompleted } from "@/app/api/webhooks/stripe/_checkout-handlers";
import {
  ANALYTICS_EVENTS,
  setServerUserProperties,
  trackServerEvent,
} from "@repo/analytics";
import {
  AUDIT_ACTIONS,
  ORG_STATUS,
  logBillingEvent,
  updateOrganizationStatus,
} from "@repo/billing";
import { cancelPendingOrganization } from "@repo/billing/stripe/checkout";
import { stripe } from "@repo/billing/stripe/client";
import type { Stripe } from "@repo/billing/stripe/client";
import { stripeSync } from "@repo/billing/stripe/sync";
import {
  syncOrgBillingFromSubscription,
  syncOrgBillingOnPaymentFailed,
  syncOrgBillingOnPaymentSucceeded,
  syncOrgBillingOnSubscriptionDeleted,
} from "@repo/billing/sync-from-stripe";
import { db } from "@repo/database";
import { eq } from "@repo/database";
import { organization, user } from "@repo/database/schema";
import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Handle checkout.session.expired event
 * Cleans up pending workspaces when checkout expires
 */
async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const orgId = session.metadata?.organizationId;
  if (!orgId) return;

  await cancelPendingOrganization(orgId);
  console.log(`[Webhook] Cleaned up expired checkout for workspace ${orgId}`);
}

/**
 * Handle customer.subscription.created event
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  // Find organization by customer ID
  const org = await db()
    .select()
    .from(organization)
    .where(eq(organization.stripeCustomerId, customerId))
    .limit(1);

  if (!org[0]) {
    console.log(`[Webhook] No organization found for customer ${customerId}`);
    return;
  }

  // Ensure organization is active
  if (org[0].status !== ORG_STATUS.ACTIVE) {
    await updateOrganizationStatus(org[0].id, ORG_STATUS.ACTIVE);
  }

  await syncOrgBillingFromSubscription(org[0].id, subscription);

  console.log(`[Webhook] Subscription created for workspace ${org[0].id}`);
}

/**
 * Handle customer.subscription.updated event
 * Handles plan upgrades/downgrades
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const org = await db()
    .select()
    .from(organization)
    .where(eq(organization.stripeCustomerId, customerId))
    .limit(1);

  if (!org[0]) return;

  // Check if this is a plan change
  const previousAttributes = (
    subscription as Stripe.Subscription & {
      previous_attributes?: {
        items?: { data?: Array<{ price?: { product?: string } }> };
      };
    }
  ).previous_attributes;

  if (previousAttributes?.items?.data) {
    const oldProductId = previousAttributes.items.data[0]?.price?.product;
    const newProductId = subscription.items.data[0]?.price?.product;

    if (oldProductId && newProductId && oldProductId !== newProductId) {
      // Plan changed
      await logBillingEvent({
        organizationId: org[0].id,
        action: AUDIT_ACTIONS.PLAN_UPGRADED, // We don't know if upgrade or downgrade without comparing prices
        fromValue: oldProductId as string,
        toValue: newProductId as string,
        metadata: {
          subscriptionId: subscription.id,
          newPriceId: subscription.items.data[0]?.price?.id,
          status: subscription.status,
        },
        performedBy: "system",
      });

      console.log(
        `[Webhook] Plan changed for workspace ${org[0].id}: ${oldProductId} -> ${newProductId}`,
      );
    }
  }

  // Update organization status based on subscription status
  if (subscription.status === "active" || subscription.status === "trialing") {
    if (org[0].status === ORG_STATUS.READONLY) {
      await updateOrganizationStatus(org[0].id, ORG_STATUS.ACTIVE);
      await logBillingEvent({
        organizationId: org[0].id,
        action: AUDIT_ACTIONS.STATUS_CHANGED,
        fromValue: ORG_STATUS.READONLY,
        toValue: ORG_STATUS.ACTIVE,
        metadata: { reason: "subscription_reactivated" },
        performedBy: "system",
      });
    }
  }

  await syncOrgBillingFromSubscription(org[0].id, subscription);
}

/**
 * Handle customer.subscription.deleted event
 * Downgrades workspace to free tier
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const org = await db()
    .select()
    .from(organization)
    .where(eq(organization.stripeCustomerId, customerId))
    .limit(1);

  if (!org[0]) return;

  // Log cancellation
  await logBillingEvent({
    organizationId: org[0].id,
    action: AUDIT_ACTIONS.SUBSCRIPTION_CANCELLED,
    fromValue: subscription.items.data[0]?.price?.product as string,
    toValue: "free",
    metadata: {
      subscriptionId: subscription.id,
      canceledAt: subscription.canceled_at,
      cancellationReason: (
        subscription as Stripe.Subscription & {
          cancellation_details?: { reason?: string };
        }
      ).cancellation_details?.reason,
    },
    performedBy: "system",
  });

  // Track subscription cancelled in PostHog
  // Find the owner of the organization
  const { member } = await import("@repo/database/schema");
  const ownerMember = await db()
    .select()
    .from(member)
    .where(eq(member.organizationId, org[0].id))
    .limit(1);

  if (ownerMember[0]?.userId) {
    const userData = await db()
      .select()
      .from(user)
      .where(eq(user.id, ownerMember[0].userId))
      .limit(1);

    const productId = subscription.items.data[0]?.price?.product as string;
    const cancellationReason = (
      subscription as Stripe.Subscription & {
        cancellation_details?: { reason?: string };
      }
    ).cancellation_details?.reason;

    await trackServerEvent(
      ANALYTICS_EVENTS.USER_SUBSCRIPTION_CANCELLED,
      ownerMember[0].userId,
      {
        email: userData[0]?.email || "",
        plan_id: productId,
        plan_name: productId,
        cancellation_reason: cancellationReason,
      },
    );

    // Update user properties
    await setServerUserProperties(ownerMember[0].userId, {
      plan_type: "free",
      subscription_status: "cancelled",
    });
  }

  // Note: We don't automatically downgrade to readonly here
  // The Inngest billing-trial-expiration function handles setting readonly status
  // This allows for grace periods and proper handling

  await syncOrgBillingOnSubscriptionDeleted(org[0].id, subscription);

  console.log(`[Webhook] Subscription cancelled for workspace ${org[0].id}`);
}

/**
 * Handle invoice.payment_failed event
 */
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;

  if (!customerId) return;

  const org = await db()
    .select()
    .from(organization)
    .where(eq(organization.stripeCustomerId, customerId))
    .limit(1);

  if (!org[0]) return;

  await logBillingEvent({
    organizationId: org[0].id,
    action: AUDIT_ACTIONS.PAYMENT_FAILED,
    metadata: {
      invoiceId: invoice.id,
      amount: invoice.amount_due,
      attemptCount: invoice.attempt_count,
    },
    performedBy: "system",
  });

  await syncOrgBillingOnPaymentFailed(org[0].id);

  console.log(`[Webhook] Payment failed for workspace ${org[0].id}`);
}

/**
 * Handle invoice.payment_succeeded event
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;

  if (!customerId) return;

  const org = await db()
    .select()
    .from(organization)
    .where(eq(organization.stripeCustomerId, customerId))
    .limit(1);

  if (!org[0]) return;

  await logBillingEvent({
    organizationId: org[0].id,
    action: AUDIT_ACTIONS.PAYMENT_SUCCEEDED,
    metadata: {
      invoiceId: invoice.id,
      amount: invoice.amount_paid,
    },
    performedBy: "system",
  });

  await syncOrgBillingOnPaymentSucceeded(org[0].id);

  // If workspace was in readonly due to payment issues, reactivate it
  if (org[0].status === ORG_STATUS.READONLY) {
    await updateOrganizationStatus(org[0].id, ORG_STATUS.ACTIVE);
    await logBillingEvent({
      organizationId: org[0].id,
      action: AUDIT_ACTIONS.STATUS_CHANGED,
      fromValue: ORG_STATUS.READONLY,
      toValue: ORG_STATUS.ACTIVE,
      metadata: { reason: "payment_succeeded" },
      performedBy: "system",
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      console.error("Missing stripe-signature header");
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 },
      );
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error("STRIPE_WEBHOOK_SECRET is not configured");
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 },
      );
    }

    const payload = await req.text();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        payload,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (verifyError: unknown) {
      const message =
        verifyError instanceof Error ? verifyError.message : "Unknown error";
      console.error("Webhook signature verification failed:", message);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    console.log(`[Webhook] Event received: ${event.type} (ID: ${event.id})`);

    // Handle billing-specific events first
    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(
            event.data.object as Stripe.Checkout.Session,
          );
          break;
        case "checkout.session.expired":
          await handleCheckoutExpired(
            event.data.object as Stripe.Checkout.Session,
          );
          break;
        case "customer.subscription.created":
          await handleSubscriptionCreated(
            event.data.object as Stripe.Subscription,
          );
          break;
        case "customer.subscription.updated":
          await handleSubscriptionUpdated(
            event.data.object as Stripe.Subscription,
          );
          break;
        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(
            event.data.object as Stripe.Subscription,
          );
          break;
        case "invoice.payment_failed":
          await handlePaymentFailed(event.data.object as Stripe.Invoice);
          break;
        case "invoice.payment_succeeded":
          await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;
      }
    } catch (billingError: unknown) {
      const message =
        billingError instanceof Error ? billingError.message : "Unknown error";
      console.error(`[Webhook] Billing handler error: ${message}`);
      // Don't return error - continue to sync
    }

    // Skip certain events from sync
    const skipSyncEvents = ["invoice.upcoming"];

    if (skipSyncEvents.includes(event.type)) {
      return NextResponse.json({ received: true, skipped: true });
    }

    // Sync event to stripe schema
    try {
      await stripeSync.processEvent(event);
      console.log(`[Webhook] Successfully synced event: ${event.type}`);

      revalidatePath("/stripe/products");
      revalidatePath("/stripe/prices");
      revalidatePath("/stripe/coupons");
      revalidatePath("/stripe/promo-codes");
    } catch (syncError: unknown) {
      const error = syncError as {
        message?: string;
        code?: string;
        column?: string;
      };
      if (error?.message?.includes("Unhandled webhook event")) {
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
        return NextResponse.json({ received: true, eventType: event.type });
      }
      if (error?.code === "23502" && error?.column === "id") {
        console.log(`[Webhook] Skipped event due to missing ID: ${event.type}`);
        return NextResponse.json({
          received: true,
          skipped: true,
          eventType: event.type,
        });
      }
      console.error(
        `[Webhook] Failed to sync event: ${error?.message || "Unknown error"}`,
      );
      return NextResponse.json(
        {
          error: `Failed to sync event: ${error?.message || "Unknown error"}`,
        },
        { status: 500 },
      );
    }

    console.log(`[Webhook] Completed processing: ${event.type}`);
    return NextResponse.json({ received: true, eventType: event.type });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Webhook] Processing failed:", message);
    return NextResponse.json(
      { error: "Webhook processing failed", message },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: "Webhook endpoint is working" });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
