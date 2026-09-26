#!/usr/bin/env bun
/**
 * Non-interactive .env.local writer used while following SETUP.md.
 * The agent asks the user for values; this script only merges them into the
 * root .env.local (existing keys are updated in place, others are kept).
 *
 * Usage:
 *   bun .agents/skills/setup/scripts/configure-env.ts --set KEY=VALUE [--set ...]
 *   bun .agents/skills/setup/scripts/configure-env.ts --from-json values.json
 *   bun .agents/skills/setup/scripts/configure-env.ts --generate BETTER_AUTH_SECRET
 *   bun .agents/skills/setup/scripts/configure-env.ts --check
 *
 * --generate KEY   writes a random base64 secret only if KEY is not set yet
 * --section NAME   section header for newly added keys (default "Setup")
 * --check          report required keys; exit 1 if any are missing
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { colors } from "../../../../scripts/lib/colors";
import { parseEnvFile, updateEnvFile } from "./lib/env";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ENV_PATH = resolve(ROOT, ".env.local");
const APP_PACKAGE = resolve(ROOT, "apps/next-app/package.json");

const REQUIRED_KEYS = [
  "DATABASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
];

const SECRET_PATTERN = /SECRET|PASSWORD|TOKEN|PRIVATE|_KEY$/;

interface Flags {
  set: Record<string, string>;
  generate: string[];
  section: string;
  check: boolean;
}

function fail(message: string): never {
  console.error(`${colors.red}✖ ${message}${colors.reset}`);
  process.exit(1);
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    set: {},
    generate: [],
    section: "Setup",
    check: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i] ?? fail(`${arg} needs a value`);
    if (arg === "--set") {
      const pair = next();
      const eq = pair.indexOf("=");
      if (eq <= 0) fail(`--set expects KEY=VALUE, got "${pair}"`);
      flags.set[pair.slice(0, eq)] = pair.slice(eq + 1);
    } else if (arg === "--from-json") {
      const data = JSON.parse(readFileSync(resolve(next()), "utf8"));
      for (const [key, value] of Object.entries(data)) {
        flags.set[key] = String(value);
      }
    } else if (arg === "--generate") flags.generate.push(next());
    else if (arg === "--section") flags.section = next();
    else if (arg === "--check") flags.check = true;
    else fail(`Unknown argument: ${arg}`);
  }
  return flags;
}

function readEnv(): Map<string, string> {
  return existsSync(ENV_PATH)
    ? parseEnvFile(readFileSync(ENV_PATH, "utf8"))
    : new Map();
}

function mask(key: string, value: string): string {
  if (!value) return "(empty)";
  if (!SECRET_PATTERN.test(key)) return value;
  return value.length <= 8 ? "********" : `${value.slice(0, 4)}…`;
}

/** Keep `next dev -p <port>` in sync with a localhost NEXT_PUBLIC_APP_URL. */
function syncDevPort(appUrl: string): void {
  let url: URL;
  try {
    url = new URL(appUrl);
  } catch {
    fail(`NEXT_PUBLIC_APP_URL is not a valid URL: ${appUrl}`);
  }
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.port) return;
  const pkg = JSON.parse(readFileSync(APP_PACKAGE, "utf8"));
  const current: string = pkg.scripts?.dev ?? "";
  const updated = current.replace(/-p\s+\d+/, `-p ${url.port}`);
  if (updated === current) return;
  pkg.scripts.dev = updated;
  writeFileSync(APP_PACKAGE, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`  updated apps/next-app dev port to ${url.port}`);
}

function check(env: Map<string, string>): boolean {
  let ok = true;
  for (const key of REQUIRED_KEYS) {
    const value = env.get(key) ?? "";
    if (value) {
      console.log(
        `  ${colors.green}✓${colors.reset} ${key} = ${mask(key, value)}`,
      );
    } else {
      ok = false;
      console.log(`  ${colors.red}✗${colors.reset} ${key} is missing`);
    }
  }
  return ok;
}

function main(): void {
  const flags = parseFlags(process.argv.slice(2));
  const existing = readEnv();
  const updates: Record<string, string> = { ...flags.set };

  for (const key of flags.generate) {
    if (!existing.get(key) && !updates[key]) {
      updates[key] = randomBytes(32).toString("base64");
    }
  }

  const appUrl =
    updates.NEXT_PUBLIC_APP_URL ?? existing.get("NEXT_PUBLIC_APP_URL");
  if (appUrl && !existing.get("BETTER_AUTH_URL") && !updates.BETTER_AUTH_URL) {
    updates.BETTER_AUTH_URL = appUrl;
  }

  if (Object.keys(updates).length > 0) {
    updateEnvFile(updates, {
      envPath: ENV_PATH,
      sectionName: flags.section,
    });
    for (const [key, value] of Object.entries(updates)) {
      console.log(
        `  ${colors.green}✓${colors.reset} ${key} = ${mask(key, value)}`,
      );
    }
    if (updates.NEXT_PUBLIC_APP_URL) syncDevPort(updates.NEXT_PUBLIC_APP_URL);
  }

  if (flags.check && !check(readEnv())) process.exit(1);
}

main();
