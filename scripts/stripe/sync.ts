import { confirm } from "@inquirer/prompts";
import { colors } from "../lib/colors";
import {
  printError,
  printHeader,
  printInfo,
  printSuccess,
  printWarning,
} from "../lib/log";

export async function syncExistingData(): Promise<boolean> {
  printHeader("STEP 5: SYNC EXISTING STRIPE DATA");

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    printWarning("DATABASE_URL not set - skipping data sync");
    return false;
  }

  console.log(
    `  ${colors.dim}This will sync existing products, prices, customers, and subscriptions${colors.reset}`,
  );
  console.log(
    `  ${colors.dim}from your Stripe account to your local database.${colors.reset}`,
  );
  console.log("");

  const shouldSyncData = await confirm({
    message: "Sync existing Stripe data to database?",
    default: true,
  });

  if (!shouldSyncData) {
    printWarning("Data sync skipped");
    return false;
  }

  try {
    printInfo("Syncing data from Stripe...");

    const { StripeSync } = await import("stripe-sync-engine");

    const stripeSync = new StripeSync({
      poolConfig: {
        connectionString: databaseUrl,
        max: 10,
        keepAlive: true,
      },
      schema: process.env.STRIPE_SCHEMA ?? "stripe",
      stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "placeholder",
      autoExpandLists: true,
      backfillRelatedEntities: true,
    });

    const result = await stripeSync.syncBackfill({
      object: "all",
    });

    console.log("");
    printSuccess("Data sync completed!");
    console.log("");
    console.log(`  ${colors.dim}Synced entities:${colors.reset}`);

    if (result.products) {
      console.log(`    Products: ${result.products.synced}`);
    }
    if (result.prices) {
      console.log(`    Prices: ${result.prices.synced}`);
    }
    if (result.customers) {
      console.log(`    Customers: ${result.customers.synced}`);
    }
    if (result.subscriptions) {
      console.log(`    Subscriptions: ${result.subscriptions.synced}`);
    }
    if (result.invoices) {
      console.log(`    Invoices: ${result.invoices.synced}`);
    }

    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    printError(`Data sync failed: ${errorMessage}`);
    return false;
  }
}
