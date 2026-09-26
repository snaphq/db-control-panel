import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { colors } from "../../../../../scripts/lib/colors";
import {
  printError,
  printHeader,
  printInfo,
  printSuccess,
  printWarning,
} from "../../../setup/scripts/lib/log";
import type { SetupResult } from "./types";

export function printSummary(result: SetupResult) {
  printHeader("SETUP COMPLETE");

  console.log(`  ${colors.bold}Summary:${colors.reset}`);
  console.log("");

  if (result.credentialsVerified) {
    printSuccess(
      `Connected to PostHog project: ${result.projectName || "Unknown"}`,
    );
    console.log(
      `    ${colors.dim}Project ID: ${result.projectId}${colors.reset}`,
    );
  } else {
    printError("PostHog credentials not verified");
  }

  if (result.actionsCreated.length > 0) {
    printSuccess(`Created ${result.actionsCreated.length} event actions:`);
    for (const action of result.actionsCreated) {
      console.log(`    ${colors.dim}${action}${colors.reset}`);
    }
  } else {
    printWarning("No new event actions created");
  }

  if (result.workflowsCreated.length > 0) {
    printSuccess(
      `Generated ${result.workflowsCreated.length} workflow configurations:`,
    );
    for (const workflow of result.workflowsCreated) {
      console.log(`    ${colors.dim}${workflow}${colors.reset}`);
    }
  }

  if (result.emailTemplatesCreated.length > 0) {
    printSuccess(
      `Created ${result.emailTemplatesCreated.length} email templates`,
    );
  }

  if (result.envUpdated) {
    printSuccess("Environment variables updated in .env.local");
  }

  console.log("");
  console.log(`${colors.bold}  Next Steps:${colors.reset}`);
  console.log(
    `    1. ${colors.cyan}bun run dev${colors.reset} - Start the development server`,
  );
  console.log(
    `    2. ${colors.cyan}bun run posthog:test-event${colors.reset} - Test event tracking`,
  );
  console.log(
    `    3. Visit ${colors.cyan}https://app.posthog.com/data-pipelines${colors.reset} to configure email workflows`,
  );
  console.log("");
  console.log(`${colors.bold}  Useful Links:${colors.reset}`);
  console.log(
    `    ${colors.dim}PostHog Dashboard:${colors.reset}     ${colors.cyan}https://app.posthog.com${colors.reset}`,
  );
  console.log(
    `    ${colors.dim}Events:${colors.reset}                ${colors.cyan}https://app.posthog.com/events${colors.reset}`,
  );
  console.log(
    `    ${colors.dim}Actions:${colors.reset}               ${colors.cyan}https://app.posthog.com/data-management/actions${colors.reset}`,
  );
  console.log(
    `    ${colors.dim}Data Pipelines:${colors.reset}        ${colors.cyan}https://app.posthog.com/pipeline/destinations${colors.reset}`,
  );
  console.log(
    `    ${colors.dim}Documentation:${colors.reset}         ${colors.cyan}https://posthog.com/docs${colors.reset}`,
  );
  console.log("");
}

export function saveSetupSummary(result: SetupResult) {
  const summaryPath = resolve(
    process.cwd(),
    "config/posthog/setup-summary.json",
  );
  const configDir = resolve(process.cwd(), "config/posthog");

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        setup_date: new Date().toISOString(),
        ...result,
      },
      null,
      2,
    ),
    "utf-8",
  );

  printInfo("Setup summary saved to: config/posthog/setup-summary.json");
}
