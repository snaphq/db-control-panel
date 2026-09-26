import { confirm } from "@inquirer/prompts";
import Stripe from "stripe";
import { colors } from "../../../../../scripts/lib/colors";
import {
  printError,
  printHeader,
  printInfo,
  printSuccess,
  printWarning,
} from "../../../setup/scripts/lib/log";
import type { VerifyApiKeysResult } from "./types";

export async function verifyApiKeys(): Promise<VerifyApiKeysResult> {
  printHeader("STEP 1: VERIFY STRIPE API KEYS");

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

  if (!secretKey) {
    printError("STRIPE_SECRET_KEY is not set in .env.local");
    console.log("");
    console.log(
      `  ${colors.dim}Get your API keys from: ${colors.cyan}https://dashboard.stripe.com/apikeys${colors.reset}`,
    );
    console.log(
      `  ${colors.dim}Add to .env.local: STRIPE_SECRET_KEY=sk_test_...${colors.reset}`,
    );
    return { valid: false, isLiveMode: false, stripe: null };
  }

  if (secretKey.startsWith("pk_")) {
    printError("STRIPE_SECRET_KEY contains a PUBLISHABLE key (pk_...)");
    printInfo("Secret keys should start with: sk_test_ or sk_live_");
    printInfo(
      "You may have swapped STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY",
    );
    return { valid: false, isLiveMode: false, stripe: null };
  }

  if (!secretKey.startsWith("sk_test_") && !secretKey.startsWith("sk_live_")) {
    printError("STRIPE_SECRET_KEY has invalid format");
    printInfo("Should start with: sk_test_ or sk_live_");
    return { valid: false, isLiveMode: false, stripe: null };
  }

  const isLiveMode = secretKey.startsWith("sk_live_");

  if (publishableKey) {
    if (publishableKey.startsWith("sk_")) {
      printWarning("STRIPE_PUBLISHABLE_KEY contains a SECRET key (sk_...)");
      printInfo("Publishable keys should start with: pk_test_ or pk_live_");
    } else if (
      !publishableKey.startsWith("pk_test_") &&
      !publishableKey.startsWith("pk_live_")
    ) {
      printWarning("STRIPE_PUBLISHABLE_KEY has invalid format");
    } else {
      printSuccess(
        `STRIPE_PUBLISHABLE_KEY: ${publishableKey.slice(0, 12)}...${publishableKey.slice(-4)}`,
      );
    }
  } else {
    printWarning(
      "STRIPE_PUBLISHABLE_KEY is not set (optional for backend-only)",
    );
  }

  printSuccess(
    `STRIPE_SECRET_KEY: ${secretKey.slice(0, 12)}...${secretKey.slice(-4)}`,
  );

  if (isLiveMode) {
    console.log("");
    console.log(
      `  ${colors.yellow}${colors.bold}╔════════════════════════════════════════════════════════╗${colors.reset}`,
    );
    console.log(
      `  ${colors.yellow}${colors.bold}║  ⚠️  WARNING: YOU ARE USING LIVE MODE CREDENTIALS!     ║${colors.reset}`,
    );
    console.log(
      `  ${colors.yellow}${colors.bold}║                                                        ║${colors.reset}`,
    );
    console.log(
      `  ${colors.yellow}${colors.bold}║  This will affect your REAL Stripe account.           ║${colors.reset}`,
    );
    console.log(
      `  ${colors.yellow}${colors.bold}║  Products and webhooks will be created in production. ║${colors.reset}`,
    );
    console.log(
      `  ${colors.yellow}${colors.bold}╚════════════════════════════════════════════════════════╝${colors.reset}`,
    );
    console.log("");

    const proceedLive = await confirm({
      message: "Are you sure you want to proceed with LIVE mode credentials?",
      default: false,
    });

    if (!proceedLive) {
      console.log(
        `\n${colors.dim}Setup cancelled. Switch to test keys (sk_test_...) for development.${colors.reset}`,
      );
      return { valid: false, isLiveMode: true, stripe: null };
    }
  }

  console.log("");
  printInfo("Testing API connection...");

  const stripe = new Stripe(secretKey, { typescript: true });

  try {
    const account = await stripe.accounts.retrieve();
    printSuccess(
      `Connected to Stripe account: ${account.settings?.dashboard?.display_name || account.id}`,
    );
    console.log(`  ${colors.dim}Account ID: ${account.id}${colors.reset}`);

    return { valid: true, isLiveMode, stripe };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    printError(`Failed to connect to Stripe: ${errorMessage}`);
    return { valid: false, isLiveMode, stripe: null };
  }
}
