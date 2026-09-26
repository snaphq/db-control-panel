import {
  ANALYTICS_EVENTS,
  setServerUserProperties,
  trackServerEvent,
} from "@repo/analytics";
import { AUDIT_ACTIONS, logBillingEvent } from "@repo/billing";
import { activatePendingOrganization } from "@repo/billing/stripe/checkout";
import { stripe } from "@repo/billing/stripe/client";
import type { Stripe } from "@repo/billing/stripe/client";
import { db } from "@repo/database";
import { eq } from "@repo/database";
import { user } from "@repo/database/schema";

export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
) {
  const orgId = session.metadata?.organizationId;
  if (!orgId) {
    console.log("[Webhook] No organizationId in checkout session metadata");
    return;
  }

  await activatePendingOrganization(orgId);

  const subscription = session.subscription
    ? await stripe.subscriptions.retrieve(session.subscription as string)
    : null;

  const isTrialing = subscription?.status === "trialing";
  const action = isTrialing
    ? AUDIT_ACTIONS.TRIAL_STARTED
    : AUDIT_ACTIONS.SUBSCRIPTION_CREATED;

  await logBillingEvent({
    organizationId: orgId,
    action,
    toValue: subscription?.items?.data[0]?.price?.product as string,
    metadata: {
      subscriptionId: subscription?.id,
      priceId: subscription?.items?.data[0]?.price?.id,
      status: subscription?.status,
      trialEnd: subscription?.trial_end,
    },
    performedBy: session.metadata?.userId || "system",
  });

  const userId = session.metadata?.userId;
  if (userId && subscription) {
    const productId = subscription.items?.data[0]?.price?.product as string;

    const userData = await db()
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    const userEmail = userData[0]?.email || session.customer_email || "";
    const userName = userData[0]?.name || "";

    if (isTrialing) {
      const trialEndDate = subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null;

      await trackServerEvent(ANALYTICS_EVENTS.USER_TRIAL_STARTED, userId, {
        email: userEmail,
        name: userName,
        plan_id: productId,
        plan_name: productId,
        trial_duration_days: trialEndDate
          ? Math.ceil(
              (trialEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
            )
          : 14,
        trial_end_date: trialEndDate?.toISOString() || "",
      });

      await setServerUserProperties(userId, {
        plan_type: "trial",
        trial_end_date: trialEndDate?.toISOString(),
        subscription_status: "trialing",
      });
    } else {
      const price = subscription.items?.data[0]?.price;
      const billingPeriod =
        price?.recurring?.interval === "year" ? "yearly" : "monthly";
      const amount = (price?.unit_amount || 0) / 100;

      await trackServerEvent(
        ANALYTICS_EVENTS.USER_SUBSCRIPTION_CREATED,
        userId,
        {
          email: userEmail,
          name: userName,
          plan_id: productId,
          plan_name: productId,
          billing_period: billingPeriod,
          amount,
          currency: price?.currency || "usd",
        },
      );

      await setServerUserProperties(userId, {
        plan_type: "tier_1",
        subscription_status: "active",
      });
    }
  }

  console.log(
    `[Webhook] Activated workspace ${orgId} with ${isTrialing ? "trial" : "subscription"}`,
  );
}
