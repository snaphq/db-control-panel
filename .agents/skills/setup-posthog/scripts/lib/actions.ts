import { confirm } from "@inquirer/prompts";
import { colors } from "../../../../../scripts/lib/colors";
import {
  printError,
  printHeader,
  printInfo,
  printStep,
  printSuccess,
  printWarning,
} from "../../../setup/scripts/lib/log";
import { createAction, getExistingActions } from "./api";

const EVENT_DEFINITIONS = [
  {
    name: "User Created",
    event: "user.created",
    description: "Triggered when a new user signs up",
  },
  {
    name: "User Verified",
    event: "user.verified",
    description: "Triggered when a user verifies their email",
  },
  {
    name: "User Logged In",
    event: "user.logged_in",
    description: "Triggered when a user logs in",
  },
  {
    name: "User Checked Pricing",
    event: "user.checked_pricing",
    description: "Triggered when a user views the pricing page",
  },
  {
    name: "User Trial Started",
    event: "user.trial_started",
    description: "Triggered when a user starts a trial",
  },
  {
    name: "User Subscription Created",
    event: "user.subscription_created",
    description: "Triggered when a user subscribes to a paid plan",
  },
  {
    name: "User Subscription Cancelled",
    event: "user.subscription_cancelled",
    description: "Triggered when a user cancels their subscription",
  },
] as const;

export async function createEventActions(
  apiKey: string,
  projectId: number,
): Promise<string[]> {
  printHeader("STEP 3: CREATE EVENT ACTIONS");

  console.log(
    `  ${colors.dim}Events to create as Actions in PostHog:${colors.reset}`,
  );
  for (const def of EVENT_DEFINITIONS) {
    console.log(`    ${colors.cyan}${def.event}${colors.reset} - ${def.name}`);
  }
  console.log("");

  const shouldCreateActions = await confirm({
    message: "Create these event actions in PostHog?",
    default: true,
  });

  if (!shouldCreateActions) {
    printWarning("Action creation skipped");
    return [];
  }

  printInfo("Checking for existing actions...");
  const existingActions = await getExistingActions(apiKey, projectId);
  const existingEventNames = new Set(
    existingActions.flatMap((action) => action.steps.map((step) => step.event)),
  );

  const createdActions: string[] = [];

  for (const [index, definition] of EVENT_DEFINITIONS.entries()) {
    printStep(
      index + 1,
      EVENT_DEFINITIONS.length,
      `Creating action: ${definition.name}`,
    );

    if (existingEventNames.has(definition.event)) {
      console.log(
        `    ${colors.dim}Action for '${definition.event}' already exists, skipping${colors.reset}`,
      );
      continue;
    }

    const action = await createAction(
      apiKey,
      projectId,
      definition.name,
      definition.event,
      definition.description,
    );

    if (action) {
      printSuccess(`Created: ${definition.name} (${definition.event})`);
      createdActions.push(definition.event);
    } else {
      printError(`Failed to create: ${definition.name}`);
    }
  }

  console.log("");
  if (createdActions.length > 0) {
    printSuccess(`Created ${createdActions.length} event actions`);
  } else {
    printInfo("No new actions created (all already exist)");
  }

  return createdActions;
}
