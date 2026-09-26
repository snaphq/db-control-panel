#!/usr/bin/env tsx
/**
 * Test PostHog Workflow Triggers
 * Run with: bun run posthog:test-workflow [workflow-id]
 *
 * Examples:
 *   bun run posthog:test-workflow
 *   bun run posthog:test-workflow user-onboarding
 *   bun run posthog:test-workflow trial-management
 */

import { resolve } from "node:path";
import { config } from "dotenv";
import { PostHog } from "posthog-node";
import { WORKFLOW_DEFINITIONS } from "./posthog-workflows";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });

// ============================================================================
// ANSI Color Codes
// ============================================================================

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

// ============================================================================
// Test Properties for Each Workflow
// ============================================================================

const WORKFLOW_TEST_PROPERTIES: Record<string, Record<string, unknown>> = {
  "user-onboarding": {
    email: "workflow-test@example.com",
    name: "Workflow Test User",
    provider: "email",
    organization_id: "org_test123",
  },
  "trial-management": {
    email: "trial-test@example.com",
    name: "Trial Test User",
    plan_id: "prod_test123",
    plan_name: "Pro Plan",
    trial_duration_days: 14,
    trial_end_date: new Date(
      Date.now() + 14 * 24 * 60 * 60 * 1000,
    ).toISOString(),
  },
  "pricing-followup": {
    source_page: "homepage",
    current_plan: "free",
    viewed_plans: ["tier_1", "tier_2", "tier_3"],
  },
};

// ============================================================================
// Main Function
// ============================================================================

async function main() {
  const workflowId = process.argv[2];

  console.log("");
  console.log(
    `${colors.bold}${colors.magenta}PostHog Workflow Tester${colors.reset}`,
  );
  console.log("");

  // Check for API key
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  if (!apiKey) {
    console.log(
      `${colors.red}✗${colors.reset} NEXT_PUBLIC_POSTHOG_KEY not found in .env.local`,
    );
    console.log(
      `  ${colors.dim}Set NEXT_PUBLIC_POSTHOG_KEY in .env.local (see env.example)${colors.reset}`,
    );
    process.exit(1);
  }

  // List available workflows if no ID provided
  if (!workflowId) {
    console.log(`  ${colors.dim}Available workflows to test:${colors.reset}`);
    console.log("");
    for (const workflow of WORKFLOW_DEFINITIONS) {
      console.log(
        `  ${colors.cyan}${workflow.id}${colors.reset} - ${workflow.name}`,
      );
      console.log(
        `    ${colors.dim}Trigger: ${workflow.trigger.event}${colors.reset}`,
      );
      console.log(
        `    ${colors.dim}Steps: ${workflow.steps.length}${colors.reset}`,
      );
      console.log("");
    }
    console.log(
      `  ${colors.dim}Usage: bun run posthog:test-workflow <workflow-id>${colors.reset}`,
    );
    console.log("");
    process.exit(0);
  }

  // Find the workflow
  const workflow = WORKFLOW_DEFINITIONS.find((w) => w.id === workflowId);

  if (!workflow) {
    console.log(
      `${colors.red}✗${colors.reset} Workflow '${workflowId}' not found`,
    );
    console.log("");
    console.log(`  ${colors.dim}Available workflows:${colors.reset}`);
    for (const w of WORKFLOW_DEFINITIONS) {
      console.log(`    ${colors.cyan}${w.id}${colors.reset}`);
    }
    console.log("");
    process.exit(1);
  }

  console.log(
    `${colors.blue}ℹ${colors.reset} Testing workflow: ${colors.cyan}${workflow.name}${colors.reset}`,
  );
  console.log(
    `${colors.blue}ℹ${colors.reset} Trigger event: ${colors.cyan}${workflow.trigger.event}${colors.reset}`,
  );
  console.log("");

  // Show workflow steps
  console.log(`  ${colors.bold}Workflow Steps:${colors.reset}`);
  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    if (step.type === "send_email") {
      console.log(
        `  ${colors.dim}${i + 1}.${colors.reset} Send email: ${step.template} ("${step.subject}")`,
      );
    } else if (step.type === "wait") {
      console.log(
        `  ${colors.dim}${i + 1}.${colors.reset} Wait: ${step.duration}`,
      );
    }
  }
  console.log("");

  // Create PostHog client
  const client = new PostHog(apiKey, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });

  // Generate test distinct ID
  const distinctId = `workflow-test-${workflowId}-${Date.now()}`;
  const properties = WORKFLOW_TEST_PROPERTIES[workflowId] || {};

  console.log(`${colors.blue}ℹ${colors.reset} Distinct ID: ${distinctId}`);
  console.log(`${colors.blue}ℹ${colors.reset} Properties:`);
  console.log(
    `  ${colors.dim}${JSON.stringify(properties, null, 2).replace(/\n/g, "\n  ")}${colors.reset}`,
  );
  console.log("");

  try {
    // First, identify the user (important for email workflows)
    console.log(`${colors.blue}ℹ${colors.reset} Identifying user...`);
    client.identify({
      distinctId,
      properties: {
        email: (properties.email as string) || `${distinctId}@test.example.com`,
        name: (properties.name as string) || "Workflow Test User",
        plan_type: "free",
        subscription_status: "none",
      },
    });
    await client.flush();

    // Then send the trigger event
    console.log(
      `${colors.blue}ℹ${colors.reset} Sending trigger event: ${colors.cyan}${workflow.trigger.event}${colors.reset}`,
    );
    client.capture({
      distinctId,
      event: workflow.trigger.event,
      properties: {
        ...properties,
        source: "workflow-test-script",
        workflow_id: workflowId,
        test_timestamp: new Date().toISOString(),
        // App context for email templates
        app_name: process.env.NEXT_PUBLIC_APP_NAME || "Test App",
        app_url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:8801",
        current_year: new Date().getFullYear(),
      },
    });

    // Flush and shutdown
    await client.flush();
    await client.shutdown();

    console.log("");
    console.log(
      `${colors.green}✓${colors.reset} Workflow trigger event sent successfully!`,
    );
    console.log("");
    console.log(
      `  ${colors.yellow}⚠${colors.reset} ${colors.bold}Important:${colors.reset}`,
    );
    console.log(
      `  ${colors.dim}For the workflow to execute, you must have configured it in PostHog.${colors.reset}`,
    );
    console.log("");
    console.log(`  ${colors.dim}Steps to set up the workflow:${colors.reset}`);
    console.log(
      `  ${colors.dim}1. Go to ${colors.cyan}https://app.posthog.com/pipeline/destinations${colors.reset}`,
    );
    console.log(
      `  ${colors.dim}2. Create a new destination (e.g., Email, Webhook, Customer.io)${colors.reset}`,
    );
    console.log(
      `  ${colors.dim}3. Set the trigger filter to: ${colors.cyan}event == '${workflow.trigger.event}'${colors.reset}`,
    );
    console.log(
      `  ${colors.dim}4. Configure the email template using: ${colors.cyan}config/posthog/templates/${colors.reset}`,
    );
    console.log("");
    console.log(`  ${colors.dim}View event in PostHog:${colors.reset}`);
    console.log(
      `  ${colors.cyan}https://app.posthog.com/events?eventType=${encodeURIComponent(workflow.trigger.event)}${colors.reset}`,
    );
    console.log("");
  } catch (error) {
    console.log(
      `${colors.red}✗${colors.reset} Failed to send workflow trigger`,
    );
    console.log(`  ${colors.dim}Error: ${error}${colors.reset}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`${colors.red}Error:${colors.reset}`, error.message);
  process.exit(1);
});
