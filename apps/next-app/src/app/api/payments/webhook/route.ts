import { stripe } from "@repo/billing/stripe/client";
import { getErrorMessage } from "@repo/core/error-utils";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeWebhookSecret) {
    return NextResponse.json(
      { status: "Failed", error: "Stripe webhook is not configured" },
      { status: 500 },
    );
  }
  const payload = await req.text();
  const res = JSON.parse(payload);
  const sig = req.headers.get("Stripe-Signature");

  const dateTime = new Date(res?.created * 1000).toLocaleDateString();
  const timeString = new Date(res?.created * 1000).toLocaleTimeString();

  try {
    if (!sig) {
      return NextResponse.json(
        { status: "Failed", error: "Missing Stripe signature" },
        { status: 400 },
      );
    }

    const event = stripe.webhooks.constructEvent(
      payload,
      sig,
      stripeWebhookSecret,
    );

    console.log("Event", event?.type);
    // charge.succeeded
    // payment_intent.succeeded
    // payment_intent.created

    /**
    if (event?.type !== "charge.succeeded") {
      return NextResponse.json({
        status: "Different event type",
      });
    }

    const response: any = await registerPayment(
      res?.data?.object?.billing_details?.email, // email
      res?.data?.object?.amount, // amount
      JSON.stringify(res), // payment info
      res?.type, // type
      String(timeString), // time
      String(dateTime), // date
      res?.data?.object?.receipt_email, // email
      res?.data?.object?.receipt_url, // url
      JSON.stringify(res?.data?.object?.payment_method_details), // Payment method details
      JSON.stringify(res?.data?.object?.billing_details), // Billing details
      res?.data?.object?.currency // Currency
    );

    if (response?.message === "success") {
      // console.log("response", response);
      return NextResponse.json({ status: "Success", response });
    }

    if (response?.message === "error") {
      // console.log("response", response);
      return NextResponse.json({
        status: "DB registration error'd",
        response
      });
    }
     */

    return NextResponse.json({
      status: "Webhook received",
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { status: "Failed", error: getErrorMessage(error) },
      { status: 400 },
    );
  }
}
