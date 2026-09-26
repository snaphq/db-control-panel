import { confirm } from "@inquirer/prompts";
import { runMigrations } from "stripe-sync-engine";
import { colors } from "../lib/colors";
import {
  printError,
  printHeader,
  printInfo,
  printSuccess,
  printWarning,
} from "../lib/log";

export async function runDatabaseMigrations(): Promise<boolean> {
  printHeader("STEP 3: DATABASE MIGRATIONS");

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    printError("DATABASE_URL is not set in .env.local");
    printInfo("Database migrations require a PostgreSQL connection string");
    return false;
  }

  const dbHost = databaseUrl.includes("@")
    ? (databaseUrl.split("@")[1]?.split("/")[0] ?? "***")
    : "***";
  printInfo(`Database: ${dbHost}`);

  const shouldRunMigration = await confirm({
    message: "Run stripe-sync-engine migrations?",
    default: true,
  });

  if (!shouldRunMigration) {
    printWarning("Database migrations skipped");
    return false;
  }

  try {
    printInfo("Running migrations...");

    await runMigrations({
      databaseUrl,
      schema: process.env.STRIPE_SCHEMA || "stripe",
    });

    printSuccess("Stripe sync schema migrations completed!");
    console.log("");
    console.log(
      `  ${colors.dim}Created tables in 'stripe' schema:${colors.reset}`,
    );
    console.log(
      `  ${colors.dim}products, prices, customers, subscriptions, invoices, charges,${colors.reset}`,
    );
    console.log(
      `  ${colors.dim}payment_intents, payment_methods, checkout_sessions, and more.${colors.reset}`,
    );

    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    printError(`Migration failed: ${errorMessage}`);

    if (errorMessage.includes("connection")) {
      printInfo("Check your DATABASE_URL connection string");
      printInfo("Ensure your database server is running and accessible");
    }

    return false;
  }
}
