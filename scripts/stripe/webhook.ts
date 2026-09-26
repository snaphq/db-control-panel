import { confirm, input } from "@inquirer/prompts";
import type Stripe from "stripe";
import { updateEnvFile } from "../../.agents/skills/setup/scripts/lib/env";
import { colors } from "../lib/colors";
import {
  printError,
  printHeader,
  printInfo,
  printSuccess,
  printWarning,
} from "../lib/log";
import { WEBHOOK_EVENTS } from "./constants";
import type { WebhookSetupResult } from "./types";

const STRIPE_ENV_OPTIONS = { sectionName: "Stripe" } as const;

export async function configureWebhook(
  stripe: Stripe,
): Promise<WebhookSetupResult> {
  printHeader("STEP 2: CONFIGURE WEBHOOK");

  const existingWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (existingWebhookSecret) {
    printInfo(
      `Existing STRIPE_WEBHOOK_SECRET found: ${existingWebhookSecret.slice(0, 10)}...`,
    );

    const reconfigure = await confirm({
      message: "Reconfigure webhook endpoint?",
      default: false,
    });

    if (!reconfigure) {
      printSuccess("Keeping existing webhook configuration");
      return { configured: true, secret: existingWebhookSecret };
    }
  }

  const defaultUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:8801";

  const baseUrl = await input({
    message: "Base URL for webhook endpoint:",
    default: defaultUrl,
  });

  const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/webhooks/stripe`;

  console.log("");
  printInfo(`Webhook endpoint: ${colors.cyan}${webhookUrl}${colors.reset}`);
  console.log("");
  console.log(`  ${colors.dim}Events to register:${colors.reset}`);

  const eventCategories: Record<string, string[]> = {};
  for (const event of WEBHOOK_EVENTS) {
    const category = event.split(".")[0];
    if (!eventCategories[category]) {
      eventCategories[category] = [];
    }
    eventCategories[category].push(event);
  }

  for (const [category, events] of Object.entries(eventCategories)) {
    console.log(
      `    ${colors.cyan}${category}:${colors.reset} ${events.map((eventName) => eventName.split(".").slice(1).join(".")).join(", ")}`,
    );
  }
  console.log("");

  const createWebhook = await confirm({
    message: "Create/update this webhook endpoint in Stripe?",
    default: true,
  });

  if (!createWebhook) {
    printWarning("Webhook configuration skipped");
    console.log("");
    console.log(
      `  ${colors.dim}To configure manually, go to: ${colors.cyan}https://dashboard.stripe.com/webhooks${colors.reset}`,
    );
    return { configured: false };
  }

  try {
    const existingWebhooks = await stripe.webhookEndpoints.list({ limit: 100 });
    const existingEndpoint = existingWebhooks.data.find(
      (endpoint) => endpoint.url === webhookUrl,
    );

    let webhookEndpoint: Stripe.WebhookEndpoint;

    if (existingEndpoint) {
      printInfo(`Updating existing webhook endpoint: ${existingEndpoint.id}`);

      webhookEndpoint = await stripe.webhookEndpoints.update(
        existingEndpoint.id,
        {
          enabled_events: WEBHOOK_EVENTS,
          description: "NextJS Starter Kit - Stripe Sync Engine",
        },
      );

      printSuccess("Webhook endpoint updated successfully");
      console.log("");
      printWarning(
        "Note: Webhook secret cannot be retrieved after initial creation.",
      );
      printInfo(
        "If you need a new secret, delete the webhook in Stripe Dashboard and run this setup again.",
      );

      if (!existingWebhookSecret) {
        console.log("");
        const manualSecret = await input({
          message:
            "Enter your existing webhook secret (whsec_...) or leave empty to skip:",
          default: "",
        });

        if (manualSecret) {
          updateEnvFile(
            { STRIPE_WEBHOOK_SECRET: manualSecret },
            STRIPE_ENV_OPTIONS,
          );
          printSuccess("Updated .env.local with webhook secret");
          return { configured: true, secret: manualSecret };
        }
      }

      return { configured: true, secret: existingWebhookSecret };
    }

    printInfo("Creating new webhook endpoint...");

    webhookEndpoint = await stripe.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: WEBHOOK_EVENTS,
      description: "NextJS Starter Kit - Stripe Sync Engine",
    });

    const webhookSecret = webhookEndpoint.secret;

    printSuccess(`Webhook created: ${webhookEndpoint.id}`);

    if (webhookSecret) {
      updateEnvFile(
        { STRIPE_WEBHOOK_SECRET: webhookSecret },
        STRIPE_ENV_OPTIONS,
      );
      printSuccess("Updated .env.local with STRIPE_WEBHOOK_SECRET");
      return { configured: true, secret: webhookSecret };
    }

    printWarning("Webhook secret not returned. Check Stripe Dashboard.");
    return { configured: true };
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string };
    printError(
      `Failed to configure webhook: ${err.message ?? "Unknown error"}`,
    );

    if (err.code === "resource_already_exists") {
      printInfo("A webhook for this URL already exists.");
      printInfo(
        `Manage webhooks at: ${colors.cyan}https://dashboard.stripe.com/webhooks${colors.reset}`,
      );
    }

    return { configured: false };
  }
}
