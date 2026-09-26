#!/usr/bin/env tsx
/**
 * Interactive PostHog Setup Script
 * Run with: bun .agents/skills/setup-posthog/scripts/setup-posthog.ts
 *
 * This script helps you:
 * 1. Verify PostHog API credentials
 * 2. Configure email service settings
 * 3. Create event actions in PostHog
 * 4. Set up email workflows (Data Pipelines)
 * 5. Test the integration
 */

import { resolve } from "node:path";
import { config } from "dotenv";
import { colors } from "../../../../scripts/lib/colors";
import { printError } from "../../setup/scripts/lib/log";
import { createEventActions } from "./lib/actions";
import { configureAppSettings, verifyCredentials } from "./lib/credentials";
import { printSummary, saveSetupSummary } from "./lib/summary";
import type { SetupResult } from "./lib/types";
import {
  getEmailTemplateIds,
  setupEmailWorkflows,
  testIntegration,
} from "./lib/workflows";

config({ path: resolve(process.cwd(), ".env.local") });

function printWelcomeBanner() {
  console.log("");
  console.log(
    `${colors.bold}${colors.magenta}┌${"─".repeat(58)}┐${colors.reset}`,
  );
  console.log(
    `${colors.bold}${colors.magenta}│${colors.reset}  ${colors.bold}PostHog Setup Wizard${colors.reset}                                    ${colors.magenta}│${colors.reset}`,
  );
  console.log(
    `${colors.bold}${colors.magenta}│${colors.reset}                                                          ${colors.magenta}│${colors.reset}`,
  );
  console.log(
    `${colors.bold}${colors.magenta}│${colors.reset}  ${colors.dim}Configure PostHog analytics and email workflows${colors.reset}        ${colors.magenta}│${colors.reset}`,
  );
  console.log(
    `${colors.bold}${colors.magenta}└${"─".repeat(58)}┘${colors.reset}`,
  );
}

async function main() {
  printWelcomeBanner();

  const result: SetupResult = {
    credentialsVerified: false,
    actionsCreated: [],
    workflowsCreated: [],
    emailTemplatesCreated: [],
    envUpdated: false,
  };

  const { valid, project, apiKey } = await verifyCredentials();
  result.credentialsVerified = valid;

  if (!valid || !project) {
    console.log("");
    printError("Cannot proceed without valid PostHog credentials.");
    console.log(
      `  ${colors.dim}Get your API keys from: ${colors.cyan}https://app.posthog.com/settings${colors.reset}`,
    );
    process.exit(1);
  }

  result.projectId = String(project.id);
  result.projectName = project.name;

  await configureAppSettings();
  result.envUpdated = true;

  result.actionsCreated = await createEventActions(apiKey, project.id);
  result.workflowsCreated = await setupEmailWorkflows();
  result.emailTemplatesCreated = getEmailTemplateIds();

  await testIntegration();

  printSummary(result);
  saveSetupSummary(result);
}

main().catch((error) => {
  if (error.name === "ExitPromptError") {
    console.log(`\n${colors.dim}Setup cancelled.${colors.reset}`);
    process.exit(0);
  }

  console.error(`\n${colors.red}Setup failed:${colors.reset}`, error.message);
  process.exit(1);
});
