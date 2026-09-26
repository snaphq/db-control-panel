import { colors } from "../../scripts/lib/colors";

export interface CliFlags {
  yes: boolean;
  help: boolean;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): CliFlags {
  const flags: CliFlags = { yes: false, help: false };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--yes" || arg === "-y" || arg === "--defaults") {
      flags.yes = true;
    } else {
      console.error(`${colors.red}Unknown argument: ${arg}${colors.reset}`);
      process.exit(1);
    }
  }

  return flags;
}

export function printHelp(): void {
  console.log(`
${colors.bold}bun run setup${colors.reset} — configure .env.local

${colors.bold}Usage:${colors.reset}
  bun run setup                                    Interactive
  bun run setup --yes                              Headless / CI

${colors.bold}Flags:${colors.reset}
  --yes, -y           Skip all prompts; accept defaults; skip optional services
                      unless their env vars are present
  --help, -h          Show this help

${colors.bold}Env-var overrides (when used with --yes):${colors.reset}
  DATABASE_URL, NEXT_PUBLIC_APP_URL, BETTER_AUTH_SECRET, GOOGLE_CLIENT_SECRET,
  STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
  UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
  RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_FROM_NAME,
  ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_EMAIL_DOMAINS
`);
}

export function printBanner(): void {
  console.log("");
  console.log(
    `${colors.bold}${colors.magenta}┌${"─".repeat(58)}┐${colors.reset}`,
  );
  console.log(
    `${colors.bold}${colors.magenta}│${colors.reset}  ${colors.bold}NextJS Starter Kit — Setup${colors.reset}                              ${colors.magenta}│${colors.reset}`,
  );
  console.log(
    `${colors.bold}${colors.magenta}│${colors.reset}                                                          ${colors.magenta}│${colors.reset}`,
  );
  console.log(
    `${colors.bold}${colors.magenta}│${colors.reset}  ${colors.dim}Configure .env.local for this project${colors.reset}                  ${colors.magenta}│${colors.reset}`,
  );
  console.log(
    `${colors.bold}${colors.magenta}└${"─".repeat(58)}┘${colors.reset}`,
  );
}
