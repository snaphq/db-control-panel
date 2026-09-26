import { confirm, input } from "@inquirer/prompts";
import { colors } from "../../../../../scripts/lib/colors";
import { updateEnvFile } from "../../../setup/scripts/lib/env";
import {
  printError,
  printHeader,
  printInfo,
  printSuccess,
  printWarning,
} from "../../../setup/scripts/lib/log";
import { getProjectInfo } from "./api";
import type { VerifyCredentialsResult } from "./types";

const POSTHOG_ENV_OPTIONS = {
  sectionName: "PostHog",
  sectionTitle: "PostHog Analytics",
} as const;

export async function verifyCredentials(): Promise<VerifyCredentialsResult> {
  printHeader("STEP 1: VERIFY POSTHOG CREDENTIALS");

  let apiKey = process.env.POSTHOG_PERSONAL_API_KEY || "";
  const publicKey = process.env.NEXT_PUBLIC_POSTHOG_KEY || "";

  if (publicKey) {
    printSuccess(
      `NEXT_PUBLIC_POSTHOG_KEY: ${publicKey.slice(0, 10)}...${publicKey.slice(-4)}`,
    );
  } else {
    printWarning("NEXT_PUBLIC_POSTHOG_KEY is not set");
    const key = await input({
      message: "Enter your PostHog Project API Key (starts with phc_):",
      validate: (val) => {
        if (!val.startsWith("phc_")) {
          return "Project API key should start with phc_";
        }
        return true;
      },
    });

    updateEnvFile({ NEXT_PUBLIC_POSTHOG_KEY: key }, POSTHOG_ENV_OPTIONS);
    printSuccess("Saved NEXT_PUBLIC_POSTHOG_KEY to .env.local");
  }

  if (!apiKey) {
    console.log("");
    printInfo(
      "A Personal API key is required to create actions and workflows programmatically.",
    );
    console.log(
      `  ${colors.dim}Get your Personal API Key from: ${colors.cyan}https://app.posthog.com/settings/user-api-keys${colors.reset}`,
    );
    console.log("");

    apiKey = await input({
      message: "Enter your PostHog Personal API Key (starts with phx_):",
      validate: (val) => {
        if (!val.startsWith("phx_")) {
          return "Personal API key should start with phx_";
        }
        return true;
      },
    });

    updateEnvFile({ POSTHOG_PERSONAL_API_KEY: apiKey }, POSTHOG_ENV_OPTIONS);
    printSuccess("Saved POSTHOG_PERSONAL_API_KEY to .env.local");
  } else {
    printSuccess(
      `POSTHOG_PERSONAL_API_KEY: ${apiKey.slice(0, 10)}...${apiKey.slice(-4)}`,
    );
  }

  console.log("");
  printInfo("Testing PostHog API connection...");

  const project = await getProjectInfo(apiKey);

  if (project) {
    printSuccess(`Connected to PostHog project: ${project.name}`);
    console.log(`  ${colors.dim}Project ID: ${project.id}${colors.reset}`);

    updateEnvFile(
      { POSTHOG_PROJECT_ID: String(project.id) },
      POSTHOG_ENV_OPTIONS,
    );
    return { valid: true, project, apiKey };
  }

  printError("Failed to connect to PostHog API");
  printInfo("Check that your Personal API Key has the correct permissions");
  return { valid: false, project: null, apiKey };
}

export async function configureAppSettings(): Promise<Record<string, string>> {
  printHeader("STEP 2: CONFIGURE APP SETTINGS");

  // App URLs are per site (sites/*/.env.development and each Vercel project),
  // so they are deliberately not written to the shared .env.local here.
  const appName =
    process.env.NEXT_PUBLIC_APP_NAME ||
    (await input({
      message: "Enter your application name:",
      default: "My App",
    }));

  const supportEmail =
    process.env.SUPPORT_EMAIL ||
    (await input({
      message: "Enter your support email:",
      default: "support@example.com",
    }));

  const settings = {
    NEXT_PUBLIC_APP_NAME: appName,
    SUPPORT_EMAIL: supportEmail,
  };

  printSuccess(`App Name: ${appName}`);
  printSuccess(`Support Email: ${supportEmail}`);

  const saveSettings = await confirm({
    message: "Save these settings to .env.local?",
    default: true,
  });

  if (saveSettings) {
    updateEnvFile(settings, POSTHOG_ENV_OPTIONS);
    printSuccess("Settings saved to .env.local");
  }

  return settings;
}
