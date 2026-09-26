#!/usr/bin/env tsx
/**
 * Test PostHog Event Tracking
 * Run with: bun run posthog:test-event [event-name]
 *
 * Examples:
 *   bun run posthog:test-event
 *   bun run posthog:test-event user.created
 *   bun run posthog:test-event user.trial_started
 */

import { resolve } from "node:path";
import { config } from "dotenv";
import { PostHog } from "posthog-node";

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
};

// ============================================================================
// Event Definitions
// ============================================================================

const TEST_EVENTS: Record<string, Record<string, unknown>> = {
  "user.created": {
    email: "test@example.com",
    name: "Test User",
    provider: "email",
  },
  "user.verified": {
    email: "test@example.com",
    verification_method: "email",
  },
  "user.logged_in": {
    email: "test@example.com",
    provider: "email",
    is_new_device: false,
  },
  "user.checked_pricing": {
    source_page: "homepage",
    viewed_plans: ["tier_1", "tier_2"],
  },
  "user.trial_started": {
    email: "test@example.com",
    name: "Test User",
    plan_id: "prod_test123",
    plan_name: "Pro Plan",
    trial_duration_days: 14,
    trial_end_date: new Date(
      Date.now() + 14 * 24 * 60 * 60 * 1000,
    ).toISOString(),
  },
  "user.subscription_created": {
    email: "test@example.com",
    name: "Test User",
    plan_id: "prod_test123",
    plan_name: "Pro Plan",
    billing_period: "monthly",
    amount: 49,
    currency: "USD",
  },
  "dashboard.viewed": {},
  "feature.used": {
    feature_name: "analytics",
    feature_category: "core",
  },
};

// ============================================================================
// Main Function
// ============================================================================

async function main() {
  const eventName = process.argv[2] || "user.created";

  console.log("");
  console.log(
    `${colors.bold}${colors.cyan}PostHog Event Tester${colors.reset}`,
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

  console.log(
    `${colors.blue}ℹ${colors.reset} API Key: ${apiKey.slice(0, 10)}...${apiKey.slice(-4)}`,
  );

  // Get event properties
  const properties = TEST_EVENTS[eventName] || {};

  if (!TEST_EVENTS[eventName]) {
    console.log(
      `${colors.yellow}⚠${colors.reset} Unknown event '${eventName}', sending with empty properties`,
    );
    console.log("");
    console.log(`  ${colors.dim}Available test events:${colors.reset}`);
    for (const event of Object.keys(TEST_EVENTS)) {
      console.log(`    ${colors.cyan}${event}${colors.reset}`);
    }
    console.log("");
  }

  // Create PostHog client
  const client = new PostHog(apiKey, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });

  // Generate test distinct ID
  const distinctId = `test-user-${Date.now()}`;

  console.log("");
  console.log(
    `${colors.blue}ℹ${colors.reset} Sending event: ${colors.cyan}${eventName}${colors.reset}`,
  );
  console.log(`${colors.blue}ℹ${colors.reset} Distinct ID: ${distinctId}`);
  console.log(`${colors.blue}ℹ${colors.reset} Properties:`);
  console.log(
    `  ${colors.dim}${JSON.stringify(properties, null, 2).replace(/\n/g, "\n  ")}${colors.reset}`,
  );
  console.log("");

  try {
    // Send the event
    client.capture({
      distinctId,
      event: eventName,
      properties: {
        ...properties,
        source: "test-script",
        test_timestamp: new Date().toISOString(),
      },
    });

    // Flush and shutdown
    await client.flush();
    await client.shutdown();

    console.log(`${colors.green}✓${colors.reset} Event sent successfully!`);
    console.log("");
    console.log(`  ${colors.dim}View in PostHog:${colors.reset}`);
    console.log(
      `  ${colors.cyan}https://app.posthog.com/events?eventType=${encodeURIComponent(eventName)}${colors.reset}`,
    );
    console.log("");

    // If it's a workflow trigger event, show workflow info
    const workflowTriggers = [
      "user.created",
      "user.trial_started",
      "user.checked_pricing",
    ];
    if (workflowTriggers.includes(eventName)) {
      console.log(
        `  ${colors.yellow}⚠${colors.reset} This event is a workflow trigger.`,
      );
      console.log(
        `  ${colors.dim}If you've configured the workflow in PostHog, it should trigger automatically.${colors.reset}`,
      );
      console.log(
        `  ${colors.dim}Check: ${colors.cyan}https://app.posthog.com/pipeline/destinations${colors.reset}`,
      );
      console.log("");
    }
  } catch (error) {
    console.log(`${colors.red}✗${colors.reset} Failed to send event`);
    console.log(`  ${colors.dim}Error: ${error}${colors.reset}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`${colors.red}Error:${colors.reset}`, error.message);
  process.exit(1);
});
