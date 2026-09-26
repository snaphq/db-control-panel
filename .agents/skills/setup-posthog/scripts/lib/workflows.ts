import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { confirm } from "@inquirer/prompts";
import { colors } from "../../../../../scripts/lib/colors";
import {
  EMAIL_TEMPLATES,
  WORKFLOW_DEFINITIONS,
} from "../../../../../scripts/posthog-workflows";
import {
  printError,
  printHeader,
  printInfo,
  printSuccess,
  printWarning,
} from "../../../setup/scripts/lib/log";

export function getEmailTemplateIds(): string[] {
  return EMAIL_TEMPLATES.map((template) => template.id);
}

export async function setupEmailWorkflows(): Promise<string[]> {
  printHeader("STEP 4: SETUP EMAIL WORKFLOWS");

  console.log(
    `  ${colors.dim}PostHog email workflows are configured in the PostHog UI.${colors.reset}`,
  );
  console.log(
    `  ${colors.dim}This step will generate configuration files and instructions.${colors.reset}`,
  );
  console.log("");

  console.log(`  ${colors.bold}Available Workflows:${colors.reset}`);
  for (const workflow of WORKFLOW_DEFINITIONS) {
    console.log(`\n  ${colors.cyan}${workflow.name}${colors.reset}`);
    console.log(
      `    ${colors.dim}Trigger: ${workflow.trigger.event}${colors.reset}`,
    );
    console.log(`    ${colors.dim}Steps:${colors.reset}`);

    for (const step of workflow.steps) {
      if (step.type === "send_email") {
        console.log(`      - Send email: ${step.template} ("${step.subject}")`);
      } else if (step.type === "wait") {
        console.log(`      - Wait: ${step.duration}`);
      }
    }
  }

  console.log("");

  const shouldGenerateConfig = await confirm({
    message: "Generate workflow configuration files?",
    default: true,
  });

  if (!shouldGenerateConfig) {
    printWarning("Workflow configuration skipped");
    return [];
  }

  const configDir = resolve(process.cwd(), "config/posthog");
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const createdWorkflows: string[] = [];
  for (const workflow of WORKFLOW_DEFINITIONS) {
    const configPath = resolve(configDir, `workflow-${workflow.id}.json`);
    writeFileSync(configPath, JSON.stringify(workflow, null, 2), "utf-8");
    createdWorkflows.push(workflow.id);
    printSuccess(`Created: config/posthog/workflow-${workflow.id}.json`);
  }

  const templatesDir = resolve(configDir, "templates");
  if (!existsSync(templatesDir)) {
    mkdirSync(templatesDir, { recursive: true });
  }

  for (const template of EMAIL_TEMPLATES) {
    const htmlPath = resolve(templatesDir, `${template.id}.html`);
    const textPath = resolve(templatesDir, `${template.id}.txt`);

    writeFileSync(htmlPath, template.htmlContent, "utf-8");
    writeFileSync(textPath, template.textContent, "utf-8");
    printSuccess(`Created: config/posthog/templates/${template.id}.html`);
  }

  console.log("");
  printInfo("Workflow configuration files have been generated.");
  console.log("");
  console.log(`  ${colors.bold}Next Steps to Enable Workflows:${colors.reset}`);
  console.log(
    `  ${colors.dim}1. Go to PostHog: ${colors.cyan}https://app.posthog.com/data-pipelines${colors.reset}`,
  );
  console.log(
    `  ${colors.dim}2. Create a new 'Email' destination${colors.reset}`,
  );
  console.log(
    `  ${colors.dim}3. Configure SMTP settings or use a provider (Customer.io, Loops, etc.)${colors.reset}`,
  );
  console.log(
    `  ${colors.dim}4. Set up filters to trigger on specific events${colors.reset}`,
  );
  console.log(
    `  ${colors.dim}5. Use the generated templates in config/posthog/templates/${colors.reset}`,
  );

  return createdWorkflows;
}

export async function testIntegration(): Promise<boolean> {
  printHeader("STEP 5: TEST INTEGRATION");

  const runTest = await confirm({
    message: "Send a test event to PostHog?",
    default: true,
  });

  if (!runTest) {
    printWarning("Integration test skipped");
    return false;
  }

  printInfo("Sending test event...");

  try {
    const publicKey = process.env.NEXT_PUBLIC_POSTHOG_KEY || "";

    if (!publicKey) {
      printError("NEXT_PUBLIC_POSTHOG_KEY not found");
      return false;
    }

    const response = await fetch("https://app.posthog.com/capture/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: publicKey,
        event: "setup.test_event",
        properties: {
          distinct_id: `setup-test-${Date.now()}`,
          source: "setup-posthog-script",
          timestamp: new Date().toISOString(),
        },
      }),
    });

    if (response.ok) {
      printSuccess("Test event sent successfully!");
      console.log("");
      console.log(
        `  ${colors.dim}View in PostHog: ${colors.cyan}https://app.posthog.com/events?eventType=setup.test_event${colors.reset}`,
      );
      return true;
    }

    printError(`Failed to send test event: ${response.statusText}`);
    return false;
  } catch (error) {
    printError(`Error sending test event: ${error}`);
    return false;
  }
}
