#!/usr/bin/env tsx
/**
 * Interactive Referral System setup script
 * Run with: bun run setup:referral
 *
 * This script helps you:
 * 1. Verify database connection
 * 2. Configure referral program settings (enable/disable, reward amounts)
 * 3. Save configuration to the referral_config table
 */

import { resolve } from "node:path";
import { confirm, input, select } from "@inquirer/prompts";
import { config } from "dotenv";
import pg from "pg";

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), ".env.local") });

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

interface SetupResult {
  databaseConnected: boolean;
  configSaved: boolean;
  enabled: boolean;
  referrerCreditAmount: number;
  refereeCreditAmount: number;
  currency: string;
  minPlanTier: string;
}

// Helper: Print section header
function printHeader(text: string) {
  console.log("");
  console.log(`${colors.cyan}${"━".repeat(60)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  ${text}${colors.reset}`);
  console.log(`${colors.cyan}${"━".repeat(60)}${colors.reset}`);
  console.log("");
}

// Helper: Print success message
function printSuccess(text: string) {
  console.log(`  ${colors.green}✓${colors.reset} ${text}`);
}

// Helper: Print error message
function printError(text: string) {
  console.log(`  ${colors.red}✗${colors.reset} ${text}`);
}

// Helper: Print warning message
function printWarning(text: string) {
  console.log(`  ${colors.yellow}⚠${colors.reset} ${text}`);
}

// Helper: Print info message
function printInfo(text: string) {
  console.log(`  ${colors.blue}ℹ${colors.reset} ${text}`);
}

// Helper: Format cents to dollars
function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Helper: Parse dollar string to cents
function dollarsToCents(dollars: string): number {
  const num = Number.parseFloat(dollars.replace(/[$,]/g, ""));
  if (Number.isNaN(num)) return 0;
  return Math.round(num * 100);
}

// Step 1: Verify Database Connection
async function verifyDatabaseConnection(): Promise<{
  connected: boolean;
  pool: pg.Pool | null;
}> {
  printHeader("STEP 1: VERIFY DATABASE CONNECTION");

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    printError("DATABASE_URL is not set in .env.local");
    console.log("");
    console.log(
      `  ${colors.dim}Add to .env.local: DATABASE_URL=postgres://user:pass@host:5432/db${colors.reset}`,
    );
    return { connected: false, pool: null };
  }

  // Mask credentials in display
  const dbHost = databaseUrl.includes("@")
    ? (databaseUrl.split("@")[1]?.split("/")[0] ?? "***")
    : "***";
  printInfo(`Database host: ${dbHost}`);

  // Test connection
  console.log("");
  printInfo("Testing database connection...");

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
  });

  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();

    printSuccess("Database connection successful!");

    // Check if referral tables exist
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('referral_config', 'referral_codes', 'referrals')
    `);

    const existingTables = result.rows.map((r) => r.table_name);

    if (existingTables.length === 3) {
      printSuccess("All referral tables exist");
    } else if (existingTables.length > 0) {
      printWarning(`Some referral tables found: ${existingTables.join(", ")}`);
      printInfo("Run 'bun run db:push' to create missing tables");
    } else {
      printWarning("Referral tables not found in database");
      printInfo("Run 'bun run db:push' to create the tables");

      const proceed = await confirm({
        message: "Continue with setup anyway? (You can apply schema later)",
        default: true,
      });

      if (!proceed) {
        return { connected: false, pool: null };
      }
    }

    return { connected: true, pool };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    printError(`Database connection failed: ${errorMessage}`);

    if (errorMessage.includes("ECONNREFUSED")) {
      printInfo("Ensure your database server is running");
    } else if (errorMessage.includes("authentication")) {
      printInfo("Check your database credentials");
    }

    return { connected: false, pool: null };
  }
}

// Step 2: Configure Referral Settings
async function configureReferralSettings(pool: pg.Pool): Promise<{
  enabled: boolean;
  referrerCreditAmount: number;
  refereeCreditAmount: number;
  currency: string;
  minPlanTier: string;
} | null> {
  printHeader("STEP 2: CONFIGURE REFERRAL PROGRAM");

  // Check for existing configuration

  let existingConfig: {
    id: string;
    enabled: boolean;
    referrer_credit_amount: number;
    referee_credit_amount: number;
    currency: string;
    min_plan_tier: string | null;
  } | null = null;

  try {
    const result = await pool.query(
      "SELECT * FROM referral_config WHERE id = 'default' LIMIT 1",
    );
    if (result.rows.length > 0) {
      existingConfig = result.rows[0];
    }
  } catch {
    // Table might not exist yet
  }

  if (existingConfig) {
    printInfo("Existing referral configuration found:");
    console.log("");
    console.log(
      `    ${colors.dim}Enabled:${colors.reset} ${existingConfig.enabled ? `${colors.green}Yes${colors.reset}` : `${colors.yellow}No${colors.reset}`}`,
    );
    console.log(
      `    ${colors.dim}Referrer reward:${colors.reset} ${formatCents(existingConfig.referrer_credit_amount)} ${existingConfig.currency.toUpperCase()}`,
    );
    console.log(
      `    ${colors.dim}Referee reward:${colors.reset} ${formatCents(existingConfig.referee_credit_amount)} ${existingConfig.currency.toUpperCase()}`,
    );
    console.log(
      `    ${colors.dim}Min plan tier:${colors.reset} ${existingConfig.min_plan_tier || "tier_1"}`,
    );
    console.log("");

    const reconfigure = await confirm({
      message: "Reconfigure referral settings?",
      default: false,
    });

    if (!reconfigure) {
      printSuccess("Keeping existing configuration");
      return {
        enabled: existingConfig.enabled,
        referrerCreditAmount: existingConfig.referrer_credit_amount,
        refereeCreditAmount: existingConfig.referee_credit_amount,
        currency: existingConfig.currency,
        minPlanTier: existingConfig.min_plan_tier || "tier_1",
      };
    }
  }

  // Configure new settings
  console.log("");
  console.log(
    `  ${colors.dim}The referral program rewards both the referrer and referee${colors.reset}`,
  );
  console.log(
    `  ${colors.dim}with credits applied to their Stripe customer balance.${colors.reset}`,
  );
  console.log("");

  // Enable/disable
  const enabled = await confirm({
    message: "Enable the referral program?",
    default: existingConfig?.enabled ?? true,
  });

  // Currency
  const currency = await select<string>({
    message: "Select reward currency:",
    choices: [
      { name: "USD ($)", value: "usd" },
      { name: "EUR (€)", value: "eur" },
      { name: "GBP (£)", value: "gbp" },
    ],
    default: existingConfig?.currency ?? "usd",
  });

  // Referrer reward amount
  const referrerDefault = existingConfig
    ? (existingConfig.referrer_credit_amount / 100).toFixed(2)
    : "10.00";

  const referrerInput = await input({
    message: `Referrer reward amount (${currency.toUpperCase()}):`,
    default: referrerDefault,
    validate: (val) => {
      const num = Number.parseFloat(val.replace(/[$,]/g, ""));
      if (Number.isNaN(num) || num < 0)
        return "Please enter a valid positive amount";
      if (num > 1000) return "Maximum reward is $1000";
      return true;
    },
  });
  const referrerCreditAmount = dollarsToCents(referrerInput);

  // Referee reward amount
  const refereeDefault = existingConfig
    ? (existingConfig.referee_credit_amount / 100).toFixed(2)
    : "10.00";

  const refereeInput = await input({
    message: `Referee reward amount (${currency.toUpperCase()}):`,
    default: refereeDefault,
    validate: (val) => {
      const num = Number.parseFloat(val.replace(/[$,]/g, ""));
      if (Number.isNaN(num) || num < 0)
        return "Please enter a valid positive amount";
      if (num > 1000) return "Maximum reward is $1000";
      return true;
    },
  });
  const refereeCreditAmount = dollarsToCents(refereeInput);

  // Minimum plan tier
  const minPlanTier = await select<string>({
    message: "Minimum plan tier required to get a referral code:",
    choices: [
      {
        name: "Tier 1 (Entry-level paid plan)",
        value: "tier_1",
      },
      {
        name: "Tier 2 (Mid-tier plan)",
        value: "tier_2",
      },
      {
        name: "Tier 3 (Premium plan)",
        value: "tier_3",
      },
      {
        name: "Any paid plan",
        value: "any_paid",
      },
    ],
    default: existingConfig?.min_plan_tier ?? "tier_1",
  });

  console.log("");
  console.log(`  ${colors.bold}Configuration summary:${colors.reset}`);
  console.log("");
  console.log(
    `    ${colors.dim}Status:${colors.reset} ${enabled ? `${colors.green}Enabled${colors.reset}` : `${colors.yellow}Disabled${colors.reset}`}`,
  );
  console.log(
    `    ${colors.dim}Referrer reward:${colors.reset} ${formatCents(referrerCreditAmount)} ${currency.toUpperCase()}`,
  );
  console.log(
    `    ${colors.dim}Referee reward:${colors.reset} ${formatCents(refereeCreditAmount)} ${currency.toUpperCase()}`,
  );
  console.log(`    ${colors.dim}Min plan tier:${colors.reset} ${minPlanTier}`);
  console.log("");

  const confirmConfig = await confirm({
    message: "Save this configuration?",
    default: true,
  });

  if (!confirmConfig) {
    printWarning("Configuration not saved");
    return null;
  }

  return {
    enabled,
    referrerCreditAmount,
    refereeCreditAmount,
    currency,
    minPlanTier,
  };
}

// Step 3: Save Configuration to Database
async function saveConfiguration(
  pool: pg.Pool,
  config: {
    enabled: boolean;
    referrerCreditAmount: number;
    refereeCreditAmount: number;
    currency: string;
    minPlanTier: string;
  },
): Promise<boolean> {
  printHeader("STEP 3: SAVE CONFIGURATION");

  try {
    printInfo("Saving configuration to database...");

    // Use upsert (INSERT ... ON CONFLICT DO UPDATE)
    await pool.query(
      `
      INSERT INTO referral_config (
        id, 
        enabled, 
        referrer_credit_amount, 
        referee_credit_amount, 
        currency, 
        min_plan_tier,
        created_at,
        updated_at
      ) VALUES (
        'default',
        $1,
        $2,
        $3,
        $4,
        $5,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        referrer_credit_amount = EXCLUDED.referrer_credit_amount,
        referee_credit_amount = EXCLUDED.referee_credit_amount,
        currency = EXCLUDED.currency,
        min_plan_tier = EXCLUDED.min_plan_tier,
        updated_at = NOW()
      `,
      [
        config.enabled,
        config.referrerCreditAmount,
        config.refereeCreditAmount,
        config.currency,
        config.minPlanTier,
      ],
    );

    printSuccess("Configuration saved successfully!");
    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    printError(`Failed to save configuration: ${errorMessage}`);

    if (errorMessage.includes("referral_config")) {
      printInfo("The referral_config table may not exist yet");
      printInfo("Run 'bun run db:push' to create the tables, then try again");
    }

    return false;
  }
}

// Print final summary
function printSummary(result: SetupResult) {
  printHeader("SETUP COMPLETE");

  console.log(`  ${colors.bold}Summary:${colors.reset}`);
  console.log("");

  if (result.databaseConnected) {
    printSuccess("Database connection verified");
  } else {
    printError("Database connection failed");
  }

  if (result.configSaved) {
    printSuccess("Referral configuration saved");
    console.log("");
    console.log(
      `    ${colors.dim}Status:${colors.reset} ${result.enabled ? `${colors.green}Enabled${colors.reset}` : `${colors.yellow}Disabled${colors.reset}`}`,
    );
    console.log(
      `    ${colors.dim}Referrer reward:${colors.reset} ${formatCents(result.referrerCreditAmount)} ${result.currency.toUpperCase()}`,
    );
    console.log(
      `    ${colors.dim}Referee reward:${colors.reset} ${formatCents(result.refereeCreditAmount)} ${result.currency.toUpperCase()}`,
    );
    console.log(
      `    ${colors.dim}Min plan tier:${colors.reset} ${result.minPlanTier}`,
    );
  } else {
    printWarning("Referral configuration not saved");
  }

  console.log("");
  console.log(`${colors.bold}  Next steps:${colors.reset}`);
  console.log(
    `    1. ${colors.cyan}bun run db:push${colors.reset}           - Apply database schema (if not done)`,
  );
  console.log(
    `    2. ${colors.cyan}bun run dev${colors.reset}               - Start development server`,
  );
  console.log(
    `    3. Visit ${colors.cyan}/adminx/referrals${colors.reset}    - Manage referrals in admin panel`,
  );
  console.log(
    `    4. Visit ${colors.cyan}/dashboard/.../referrals${colors.reset} - User referral dashboard`,
  );

  console.log("");
  console.log(`${colors.bold}  How it works:${colors.reset}`);
  console.log(
    `    ${colors.dim}1. Users on paid plans get a unique referral code${colors.reset}`,
  );
  console.log(
    `    ${colors.dim}2. New users enter the code during checkout${colors.reset}`,
  );
  console.log(
    `    ${colors.dim}3. Referee gets ${formatCents(result.refereeCreditAmount)} credit when they start a paid subscription${colors.reset}`,
  );
  console.log(
    `    ${colors.dim}4. Referrer gets ${formatCents(result.referrerCreditAmount)} credit when referee starts paid subscription${colors.reset}`,
  );
  console.log("");
}

// Main function
async function main() {
  // Welcome message
  console.log("");
  console.log(
    `${colors.bold}${colors.magenta}┌${"─".repeat(58)}┐${colors.reset}`,
  );
  console.log(
    `${colors.bold}${colors.magenta}│${colors.reset}  ${colors.bold}Referral System Setup Wizard${colors.reset}                          ${colors.magenta}│${colors.reset}`,
  );
  console.log(
    `${colors.bold}${colors.magenta}│${colors.reset}                                                          ${colors.magenta}│${colors.reset}`,
  );
  console.log(
    `${colors.bold}${colors.magenta}│${colors.reset}  ${colors.dim}Configure the referral program for your app${colors.reset}           ${colors.magenta}│${colors.reset}`,
  );
  console.log(
    `${colors.bold}${colors.magenta}└${"─".repeat(58)}┘${colors.reset}`,
  );

  const result: SetupResult = {
    databaseConnected: false,
    configSaved: false,
    enabled: false,
    referrerCreditAmount: 1000,
    refereeCreditAmount: 1000,
    currency: "usd",
    minPlanTier: "tier_1",
  };

  // Step 1: Verify Database
  const { connected, pool } = await verifyDatabaseConnection();
  result.databaseConnected = connected;

  if (!connected || !pool) {
    console.log("");
    printError("Cannot proceed without database connection.");
    console.log(
      `  ${colors.dim}Configure DATABASE_URL in .env.local and try again.${colors.reset}`,
    );
    process.exit(1);
  }

  // Step 2: Configure Settings
  const settings = await configureReferralSettings(pool);

  if (settings) {
    result.enabled = settings.enabled;
    result.referrerCreditAmount = settings.referrerCreditAmount;
    result.refereeCreditAmount = settings.refereeCreditAmount;
    result.currency = settings.currency;
    result.minPlanTier = settings.minPlanTier;

    // Step 3: Save Configuration
    result.configSaved = await saveConfiguration(pool, settings);
  }

  // Cleanup
  await pool.end();

  // Print summary
  printSummary(result);
}

main().catch((error) => {
  if (error.name === "ExitPromptError") {
    console.log(`\n${colors.dim}Setup cancelled.${colors.reset}`);
    process.exit(0);
  }
  console.error(`\n${colors.red}Setup failed:${colors.reset}`, error.message);
  process.exit(1);
});
