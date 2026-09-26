import { colors } from "../../../../../scripts/lib/colors";
import {
  printError,
  printHeader,
  printSuccess,
  printWarning,
} from "../../../setup/scripts/lib/log";
import type { SetupResult } from "./types";

export function printWelcomeBanner() {
  console.log("");
  console.log(
    `${colors.bold}${colors.magenta}┌${"─".repeat(58)}┐${colors.reset}`,
  );
  console.log(
    `${colors.bold}${colors.magenta}│${colors.reset}  ${colors.bold}Stripe Setup Wizard${colors.reset}                                     ${colors.magenta}│${colors.reset}`,
  );
  console.log(
    `${colors.bold}${colors.magenta}│${colors.reset}                                                          ${colors.magenta}│${colors.reset}`,
  );
  console.log(
    `${colors.bold}${colors.magenta}│${colors.reset}  ${colors.dim}Configure Stripe payments for your NextJS app${colors.reset}          ${colors.magenta}│${colors.reset}`,
  );
  console.log(
    `${colors.bold}${colors.magenta}└${"─".repeat(58)}┘${colors.reset}`,
  );
}

export function printSummary(result: SetupResult, isLiveMode: boolean) {
  printHeader("SETUP COMPLETE");

  console.log(`  ${colors.bold}Summary:${colors.reset}`);
  console.log("");

  if (result.keysVerified) {
    const modeText = isLiveMode
      ? `${colors.yellow}(LIVE MODE)${colors.reset}`
      : `${colors.green}(Test Mode)${colors.reset}`;
    printSuccess(`API Keys verified ${modeText}`);
  } else {
    printError("API Keys not verified");
  }

  if (result.webhookConfigured) {
    printSuccess("Webhook endpoint configured");
    if (result.webhookSecret) {
      console.log(
        `    ${colors.dim}Secret: ${result.webhookSecret.slice(0, 15)}...${colors.reset}`,
      );
    }
  } else {
    printWarning("Webhook not configured");
  }

  if (result.migrationRan) {
    printSuccess("Database migrations completed");
  } else {
    printWarning("Database migrations skipped");
  }

  if (result.productsCreated.length > 0) {
    printSuccess(`Created ${result.productsCreated.length} products:`);
    for (const product of result.productsCreated) {
      console.log(
        `    ${colors.dim}${product.name}: ${product.id}${colors.reset}`,
      );
    }
  } else {
    printWarning("No products created");
  }

  if (result.dataBackfilled) {
    printSuccess("Existing data synced to database");
  }

  console.log("");
  console.log(`${colors.bold}  Next steps:${colors.reset}`);
  console.log(
    `    1. ${colors.cyan}bun run dev${colors.reset}              - Start development server`,
  );
  console.log(
    `    2. Visit ${colors.cyan}/adminx/stripe/products${colors.reset} - Manage products & pricing`,
  );

  if (!result.webhookConfigured) {
    console.log(
      `    3. Configure webhook at ${colors.cyan}https://dashboard.stripe.com/webhooks${colors.reset}`,
    );
  }

  console.log("");
  console.log(`${colors.bold}  Useful links:${colors.reset}`);
  console.log(
    `    ${colors.dim}Stripe Dashboard:${colors.reset}  ${colors.cyan}https://dashboard.stripe.com${colors.reset}`,
  );
  console.log(
    `    ${colors.dim}Webhook Logs:${colors.reset}      ${colors.cyan}https://dashboard.stripe.com/webhooks${colors.reset}`,
  );
  console.log(
    `    ${colors.dim}API Keys:${colors.reset}          ${colors.cyan}https://dashboard.stripe.com/apikeys${colors.reset}`,
  );
  console.log("");
}
