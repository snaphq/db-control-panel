import { stripeSync } from "@repo/billing/stripe/sync";

async function backfillStripeData() {
  console.log("🔄 Backfilling Stripe data...");

  try {
    const result = await stripeSync.syncBackfill({
      object: "all",
    });

    console.log("\n✅ Stripe data backfill completed successfully!");
    console.log("\n📊 Synced entities:");

    if (result.products) {
      console.log(`  - Products: ${result.products.synced}`);
    }
    if (result.prices) {
      console.log(`  - Prices: ${result.prices.synced}`);
    }
    if (result.customers) {
      console.log(`  - Customers: ${result.customers.synced}`);
    }
    if (result.subscriptions) {
      console.log(`  - Subscriptions: ${result.subscriptions.synced}`);
    }
    if (result.invoices) {
      console.log(`  - Invoices: ${result.invoices.synced}`);
    }
    if (result.charges) {
      console.log(`  - Charges: ${result.charges.synced}`);
    }
    if (result.paymentIntents) {
      console.log(`  - Payment Intents: ${result.paymentIntents.synced}`);
    }
    if (result.checkoutSessions) {
      console.log(`  - Checkout Sessions: ${result.checkoutSessions.synced}`);
    }

    console.log("\n✨ All Stripe data has been synced to your database!");
    process.exit(0);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : "";
    console.error("❌ Backfill failed:", errorMessage);
    console.error(errorStack);
    process.exit(1);
  }
}

backfillStripeData();
