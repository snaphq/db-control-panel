import { auth } from "@repo/auth/server";
import { stripe } from "@repo/billing/stripe/client";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

/**
 * POST /api/billing/setup-intent
 * Creates a Stripe Customer (scoped to the signing-up user) and a SetupIntent
 * so the client can collect card details inline without charging anything.
 * The customer is later attached to the organization on trial creation.
 */
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const customer = await stripe.customers.create({
      email: session.user.email,
      name: session.user.name ?? undefined,
      metadata: { userId: session.user.id, purpose: "workspace-signup" },
    });

    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      usage: "off_session",
      automatic_payment_methods: { enabled: true },
    });

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      customerId: customer.id,
    });
  } catch (error) {
    console.error("setup-intent failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create setup intent", message },
      { status: 500 },
    );
  }
}
