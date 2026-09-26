#!/usr/bin/env bun
/**
 * Symlink the root .env.local into apps/backend, every sites/* app, and
 * packages/database so every workspace reads the same shared secrets
 * without duplicating them. Per-app local URLs stay in each app's committed
 * .env.development.
 *
 * Usage:
 *   bun .agents/skills/setup/scripts/link-env.ts
 */
import {
  existsSync,
  lstatSync,
  readdirSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { colors } from "../../../../scripts/lib/colors";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SOURCE = resolve(ROOT, ".env.local");

function siteDirs(): string[] {
  const sitesDir = resolve(ROOT, "sites");
  if (!existsSync(sitesDir)) return [];
  return readdirSync(sitesDir)
    .map((name) => resolve(sitesDir, name))
    .filter((dir) => existsSync(resolve(dir, "package.json")));
}

const TARGETS = [
  resolve(ROOT, "apps/backend/.env.local"),
  ...siteDirs().map((dir) => resolve(dir, ".env.local")),
  resolve(ROOT, "packages/database/.env.local"),
];

const c = colors;

function fail(msg: string): never {
  console.error(`${c.red}✖${c.reset} ${msg}`);
  process.exit(1);
}

function info(msg: string) {
  console.log(`${c.cyan}ℹ${c.reset} ${msg}`);
}

function ok(msg: string) {
  console.log(`${c.green}✔${c.reset} ${msg}`);
}

function bold(msg: string) {
  return `${c.bold}${msg}${c.reset}`;
}

if (!existsSync(SOURCE)) {
  console.error(`${c.red}✖${c.reset} .env.local not found at repo root.\n`);
  console.log("Pull environment from Vercel, then retry:\n");
  console.log(`  ${bold("vc pull")}`);
  console.log(`  ${bold("cp .vercel/.env.development.local .env.local")}\n`);
  console.log("Then run:\n");
  console.log(`  ${bold("bun .agents/skills/setup/scripts/link-env.ts")}`);
  process.exit(1);
}

for (const target of TARGETS) {
  const rel = relative(ROOT, target);

  if (existsSync(target) || isSymlink(target)) {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) {
      unlinkSync(target);
    } else {
      fail(
        `${rel} exists and is not a symlink. Refusing to overwrite. Move or delete it manually.`,
      );
    }
  }

  symlinkSync(SOURCE, target);
  ok(`linked ${rel} -> ${relative(ROOT, SOURCE)}`);
}

info("Done. Restart your dev server to pick up the env.");

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}
