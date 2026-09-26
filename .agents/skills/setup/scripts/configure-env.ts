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
 *   bun .agents/skills/setup/scripts/configure-env.ts --site com.site-a \
 *     --set NEXT_PUBLIC_APP_URL=http://localhost:8801
 *
 * --generate KEY   writes a random base64 secret only if KEY is not set yet
 * --section NAME   section header for newly added keys (default "Setup")
 * --check          report required keys; exit 1 if any are missing
 * --site FOLDER    write to sites/FOLDER/.env.development instead (non-secret
 *                  local values such as the site URL; the file is committed)
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { colors } from "../../../../scripts/lib/colors";
import { parseEnvFile, updateEnvFile } from "./lib/env";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ROOT_ENV_PATH = resolve(ROOT, ".env.local");

const REQUIRED_KEYS = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BACKEND_ADMIN_EMAILS",
  "BACKEND_SESSION_SECRET",
];

// Each app sets its own URL in its .env.development; a root value would
// override every app's value with one URL.
const PER_APP_KEYS = ["NEXT_PUBLIC_APP_URL", "BETTER_AUTH_URL"];

const SECRET_PATTERN = /SECRET|PASSWORD|TOKEN|PRIVATE|_KEY$/;

interface Flags {
  set: Record<string, string>;
  generate: string[];
  section: string;
  check: boolean;
  site?: string;
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
    else if (arg === "--site") flags.site = next();
    else fail(`Unknown argument: ${arg}`);
  }
  return flags;
}

function readEnv(envPath: string): Map<string, string> {
  return existsSync(envPath)
    ? parseEnvFile(readFileSync(envPath, "utf8"))
    : new Map();
}

function siteDir(site: string): string {
  const dir = resolve(ROOT, "sites", site);
  if (!existsSync(resolve(dir, "package.json"))) {
    fail(`sites/${site} is not a site workspace`);
  }
  return dir;
}

function mask(key: string, value: string): string {
  if (!value) return "(empty)";
  if (!SECRET_PATTERN.test(key)) return value;
  return value.length <= 8 ? "********" : `${value.slice(0, 4)}…`;
}

/** Keep a site's `next dev -p <port>` in sync with its localhost URL. */
function syncDevPort(appDir: string, appUrl: string): void {
  let url: URL;
  try {
    url = new URL(appUrl);
  } catch {
    fail(`NEXT_PUBLIC_APP_URL is not a valid URL: ${appUrl}`);
  }
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.port) return;
  const appPackage = resolve(appDir, "package.json");
  const pkg = JSON.parse(readFileSync(appPackage, "utf8"));
  const current: string = pkg.scripts?.dev ?? "";
  const updated = current.replace(/-p\s+\d+/, `-p ${url.port}`);
  if (updated === current) return;
  pkg.scripts.dev = updated;
  writeFileSync(appPackage, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(
    `  updated ${appDir.slice(ROOT.length + 1)} dev port to ${url.port}`,
  );
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
  for (const key of PER_APP_KEYS) {
    if (env.get(key)) {
      ok = false;
      console.log(
        `  ${colors.red}✗${colors.reset} ${key} is set in .env.local; move it to each app's .env.development (--site)`,
      );
    }
  }
  return ok;
}

function main(): void {
  const flags = parseFlags(process.argv.slice(2));
  const appDir = flags.site ? siteDir(flags.site) : undefined;
  const envPath = appDir ? resolve(appDir, ".env.development") : ROOT_ENV_PATH;
  const existing = readEnv(envPath);
  const updates: Record<string, string> = { ...flags.set };

  if (!appDir) {
    const misplaced = PER_APP_KEYS.filter((key) => key in updates);
    if (misplaced.length > 0) {
      fail(`${misplaced.join(", ")} are per-site; pass --site <folder>`);
    }
  } else if (flags.generate.length > 0) {
    fail("--generate writes secrets; use it without --site");
  }

  for (const key of flags.generate) {
    if (!existing.get(key) && !updates[key]) {
      updates[key] = randomBytes(32).toString("base64");
    }
  }

  const appUrl =
    updates.NEXT_PUBLIC_APP_URL ?? existing.get("NEXT_PUBLIC_APP_URL");
  if (appDir && appUrl && !updates.BETTER_AUTH_URL) {
    updates.BETTER_AUTH_URL = appUrl;
  }

  if (Object.keys(updates).length > 0) {
    updateEnvFile(updates, {
      envPath,
      sectionName: flags.section,
    });
    for (const [key, value] of Object.entries(updates)) {
      console.log(
        `  ${colors.green}✓${colors.reset} ${key} = ${mask(key, value)}`,
      );
    }
    if (appDir && updates.NEXT_PUBLIC_APP_URL) {
      syncDevPort(appDir, updates.NEXT_PUBLIC_APP_URL);
    }
  }

  if (flags.check && !check(readEnv(ROOT_ENV_PATH))) process.exit(1);
}

main();
