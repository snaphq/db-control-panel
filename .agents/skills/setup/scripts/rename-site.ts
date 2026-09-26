#!/usr/bin/env bun
/**
 * Rename one of the placeholder tenant sites (sites/com.site-a,
 * sites/com.site-b, sites/com.site-c) and, optionally, set its brand, domain,
 * and tenant. Any placeholder folder works; the list is not hardcoded.
 *
 * Usage:
 *   bun .agents/skills/setup/scripts/rename-site.ts \
 *     --from com.site-a --to com.acme \
 *     [--name "Acme"] [--domain app.acme.com] [--tenant acme] [--mcp-name acme-mcp]
 *
 * --to        new folder and package name (lowercase, dots and dashes)
 * --name      display name (site.config.ts `name`)
 * --domain    production host, stored as the tenant's primary domain
 * --tenant    tenant id and slug this site serves
 * --mcp-name  MCP server name advertised by the site's /mcp endpoint
 *
 * The folder is moved with `git mv`, and every tracked reference to the old
 * folder or package name (root scripts, deploy workflow, Vercel and Docker
 * config, tsconfig/vitest references, docs, dead-code baselines) is updated.
 * Run `bun install` afterwards to refresh bun.lock.
 */

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { colors } from "../../../../scripts/lib/colors";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../../..");
const NAME_PATTERN = /^[a-z0-9]+([.-][a-z0-9]+)*$/;

// Setup material documents the placeholder names and is deleted by finalize.
const SKIP = [
  /^SETUP\.md$/,
  /^\.agents\/skills\/setup/,
  /^\.agents\/tasks\//,
  /^bun\.lock$/,
];

const OPTIONS = ["from", "to", "name", "domain", "tenant", "mcp-name"] as const;
type Option = (typeof OPTIONS)[number];

function fail(message: string): never {
  console.error(`${colors.red}✖ ${message}${colors.reset}`);
  process.exit(1);
}

function parseArgs(argv: string[]): Partial<Record<Option, string>> {
  const values: Partial<Record<Option, string>> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "") as Option;
    const value = argv[i + 1];
    if (!OPTIONS.includes(key) || value === undefined) {
      fail(`Unexpected argument: ${argv[i]}`);
    }
    values[key] = value.trim();
  }
  return values;
}

/** "com.site-a" -> "site-a", used for the root `dev:<short>` script. */
function shortName(folder: string): string {
  return folder.split(".").slice(1).join(".") || folder;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceInTrackedFiles(from: string, to: string): string[] {
  const files = execFileSync("git", ["ls-files"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter((file) => file && !SKIP.some((pattern) => pattern.test(file)));
  // Match the folder/package name only as a whole token.
  const token = new RegExp(
    `(?<![A-Za-z0-9.-])${escapeRegExp(from)}(?![A-Za-z0-9-])`,
    "g",
  );
  const changed: string[] = [];
  for (const file of files) {
    const path = join(ROOT, file);
    // Skip symlinks (e.g. .claude/skills/* -> .agents/skills/*) and non-files.
    if (!existsSync(path) || !lstatSync(path).isFile()) continue;
    const content = readFileSync(path, "utf8");
    if (content.includes("\u0000") || !token.test(content)) continue;
    token.lastIndex = 0;
    writeFileSync(path, content.replace(token, to));
    changed.push(file);
  }
  return changed;
}

function renameDevScript(from: string, to: string): void {
  const path = join(ROOT, "package.json");
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  const scripts: Record<string, string> = pkg.scripts ?? {};
  const oldKey = `dev:${shortName(from)}`;
  if (!(oldKey in scripts)) return;
  pkg.scripts = Object.fromEntries(
    Object.entries(scripts).map(([key, value]) =>
      key === oldKey ? [`dev:${shortName(to)}`, value] : [key, value],
    ),
  );
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
}

function setConfigValue(file: string, key: string, value: string): void {
  const content = readFileSync(file, "utf8");
  const pattern = new RegExp(`(\\n\\s*${key}: )"[^"]*"`);
  if (!pattern.test(content)) fail(`${key} not found in ${file}`);
  writeFileSync(file, content.replace(pattern, `$1${JSON.stringify(value)}`));
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const from = args.from ?? fail("--from is required");
  const to = args.to ?? fail("--to is required");
  if (!NAME_PATTERN.test(to)) {
    fail("--to must be lowercase letters and digits separated by dots/dashes");
  }
  if (!existsSync(join(ROOT, "sites", from, "package.json"))) {
    fail(`sites/${from} does not exist`);
  }
  if (from !== to && existsSync(join(ROOT, "sites", to))) {
    fail(`sites/${to} already exists`);
  }
  if (args.domain && /[/:]/.test(args.domain)) {
    fail("--domain is a host name such as app.acme.com (no scheme or path)");
  }
  if (args.tenant && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(args.tenant)) {
    fail("--tenant must be lowercase letters, digits, and dashes");
  }

  if (from !== to) {
    execFileSync("git", ["mv", `sites/${from}`, `sites/${to}`], { cwd: ROOT });
    renameDevScript(from, to);
    for (const file of replaceInTrackedFiles(from, to)) {
      console.log(`  updated ${file}`);
    }
  }

  const config = join(ROOT, "sites", to, "src/site.config.ts");
  if (args.name) setConfigValue(config, "name", args.name);
  if (args.domain) setConfigValue(config, "domain", args.domain);
  if (args.tenant) {
    setConfigValue(config, "tenantId", args.tenant);
    setConfigValue(config, "tenantSlug", args.tenant);
  }
  if (args["mcp-name"]) setConfigValue(config, "serverName", args["mcp-name"]);

  console.log(
    `${colors.green}✔${colors.reset} sites/${from} → sites/${to}. Next: ${colors.bold}bun install${colors.reset}, then review sites/${to}/src/site.config.ts.`,
  );
  if (args.tenant) {
    console.log(
      `  If this is your primary site, set DEFAULT_TENANT_ID=${args.tenant} in .env.local.`,
    );
  }
}

main();
