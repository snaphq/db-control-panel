#!/usr/bin/env tsx
/**
 * Interactive Stripe setup script
 * Run with: bun .agents/skills/setup-stripe/scripts/setup-stripe.ts
 *
 * This script helps you:
 * 1. Verify Stripe API keys
 * 2. Configure webhooks
 * 3. Run database migrations for stripe-sync-engine
 * 4. Create default products and pricing plans
 * 5. Sync existing Stripe data to your database
 */

import { resolve } from "node:path";
import { config } from "dotenv";
import { colors } from "../../../../scripts/lib/colors";
import { printError, printWarning } from "../../setup/scripts/lib/log";
import { runDatabaseMigrations } from "./lib/migrations";
import { createDefaultProducts } from "./lib/products";
import { printSummary, printWelcomeBanner } from "./lib/summary";
import { syncExistingData } from "./lib/sync";
import type { SetupResult } from "./lib/types";
import { verifyApiKeys } from "./lib/verify";
import { configureWebhook } from "./lib/webhook";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  printWelcomeBanner();

  const result: SetupResult = {
    keysVerified: false,
    webhookConfigured: false,
    migrationRan: false,
    productsCreated: [],
    dataBackfilled: false,
  };

  const { valid, isLiveMode, stripe } = await verifyApiKeys();
  result.keysVerified = valid;

  if (!valid || !stripe) {
    console.log("");
    printError("Cannot proceed without valid Stripe API keys.");
    console.log(
      `  ${colors.dim}Add your keys to .env.local and run this script again.${colors.reset}`,
    );
    process.exit(1);
  }

  const webhookResult = await configureWebhook(stripe);
  result.webhookConfigured = webhookResult.configured;
  result.webhookSecret = webhookResult.secret;

  result.migrationRan = await runDatabaseMigrations();
  result.productsCreated = await createDefaultProducts(stripe);

  if (result.migrationRan) {
    result.dataBackfilled = await syncExistingData();
  } else {
    console.log("");
    printWarning("Skipping data sync since database migrations were not run.");
  }

  printSummary(result, isLiveMode);
}

main().catch((error) => {
  if (error.name === "ExitPromptError") {
    console.log(`\n${colors.dim}Setup cancelled.${colors.reset}`);
    process.exit(0);
  }
  console.error(`\n${colors.red}Setup failed:${colors.reset}`, error.message);
  process.exit(1);
});
