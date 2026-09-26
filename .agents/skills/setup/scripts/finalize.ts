#!/usr/bin/env bun
/**
 * Final SETUP.md step: remove every setup artifact, verify nothing stale is
 * left, and commit.
 *
 * Usage:
 *   bun .agents/skills/setup/scripts/finalize.ts             # full run + commit
 *   bun .agents/skills/setup/scripts/finalize.ts --no-commit # leave changes staged-free
 *   bun .agents/skills/setup/scripts/finalize.ts --ci        # no env check, no commit
 *
 * Steps, driven by ../manifest.json:
 *   1. check .env.local has the required values (skipped with --ci)
 *   2. strip `setup:start` … `setup:end` marker blocks from tracked files
 *   3. delete the manifest's paths (SETUP.md, setup* skills, kit-only files)
 *   4. bun install
 *   5. residue scan: no manifest token may remain in the repo
 *   6. dead-code gate, then shrink the baselines
 *   7. doc, skill-link, lint and build checks
 *   8. git commit (unless --no-commit / --ci)
 *
 * Fails fast with the failing step's output. Never bypasses git hooks.
 */

import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "../../../..");

interface Manifest {
  delete: string[];
  markerBlocks: { start: string; end: string };
  residueTokens: string[];
  residueIgnore: string[];
}

const flags = new Set(process.argv.slice(2));
const ci = flags.has("--ci");
const commit = !ci && !flags.has("--no-commit");

// Load everything we need from the skill before step 3 deletes it.
const manifest: Manifest = JSON.parse(
  readFileSync(join(SCRIPT_DIR, "..", "manifest.json"), "utf8"),
);

function step(title: string): void {
  console.log(`\n\x1b[36m▸ ${title}\x1b[0m`);
}

function fail(message: string): never {
  console.error(`\n\x1b[31m✖ ${message}\x1b[0m`);
  console.error("Fix the problem and re-run finalize. Nothing was committed.");
  process.exit(1);
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) {
    fail(`\`${command} ${args.join(" ")}\` failed (exit ${result.status})`);
  }
}

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

function checkEnv(): void {
  step("Checking .env.local");
  run("bun", [join(SCRIPT_DIR, "configure-env.ts"), "--check"]);
}

function stripMarkerBlocks(): void {
  step("Removing setup marker blocks");
  const { start, end } = manifest.markerBlocks;
  let files: string[] = [];
  try {
    files = git(["grep", "-l", "--untracked", start])
      .split("\n")
      .filter(Boolean);
  } catch {
    return; // git grep exits 1 when nothing matches
  }
  for (const file of files) {
    if (file.startsWith(".agents/skills/setup")) continue; // deleted next
    const path = join(ROOT, file);
    const lines = readFileSync(path, "utf8").split("\n");
    const kept: string[] = [];
    let inside = false;
    for (const line of lines) {
      if (line.includes(start)) inside = true;
      else if (line.includes(end)) inside = false;
      else if (!inside) kept.push(line);
    }
    if (inside) fail(`${file}: \`${start}\` without a matching \`${end}\``);
    writeFileSync(path, kept.join("\n").replace(/\n{3,}/g, "\n\n"));
    console.log(`  ${file}`);
  }
}

function expand(pattern: string): string[] {
  if (!pattern.endsWith("*")) return [pattern];
  const dir = dirname(pattern);
  const prefix = pattern.slice(dir.length + 1, -1);
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((name) => name.startsWith(prefix))
    .map((name) => join(dir, name));
}

function deletePaths(): void {
  step("Deleting setup files");
  for (const pattern of manifest.delete) {
    for (const rel of expand(pattern)) {
      const abs = join(ROOT, rel);
      // lstat semantics: rmSync removes a symlink itself, not its target.
      rmSync(abs, { recursive: true, force: true });
      console.log(`  ${rel}`);
    }
  }
}

function residueScan(): void {
  step("Scanning for setup leftovers");
  const excludes = manifest.residueIgnore.map((p) => `:(exclude)${p}`);
  const hits: string[] = [];
  for (const token of manifest.residueTokens) {
    try {
      const out = git([
        "grep",
        "-n",
        "-i",
        "-F",
        "--untracked",
        token,
        "--",
        ".",
        ...excludes,
      ]);
      hits.push(...out.split("\n").filter(Boolean));
    } catch {
      // no match
    }
  }
  if (hits.length > 0) {
    fail(
      `Setup leftovers found:\n${[...new Set(hits)].map((h) => `  ${h}`).join("\n")}`,
    );
  }
  console.log("  none");
}

// Renaming the template's sites is optional, so leftovers only warn.
function warnPlaceholderSites(): void {
  const placeholders = ["com.site-a", "com.site-b"].filter((site) =>
    existsSync(join(ROOT, "sites", site)),
  );
  if (placeholders.length === 0) return;
  console.log(
    `\n\x1b[33m! Placeholder site folders remain: ${placeholders.map((site) => `sites/${site}`).join(", ")}. Rename them with rename-site.ts before finalizing if you want your own names.\x1b[0m`,
  );
}

function main(): void {
  if (!existsSync(join(ROOT, "SETUP.md"))) {
    fail("SETUP.md not found — this project already looks set up.");
  }
  if (!ci) checkEnv();
  warnPlaceholderSites();
  stripMarkerBlocks();
  deletePaths();

  step("Installing dependencies");
  run("bun", ["install"]);

  residueScan();

  step("Dead-code gate");
  run("bun", ["run", "check:dead-code"]);
  run("bun", ["run", "check:dead-code", "--update-baseline"]);

  step("Repository checks");
  for (const script of [
    "check:doc-coverage",
    "check:skill-links",
    "lint",
    "build",
  ]) {
    run("bun", ["run", script]);
  }

  if (commit) {
    step("Committing");
    run("git", ["add", "-A"]);
    run("git", ["commit", "-m", "chore: complete project setup"]);
  }

  console.log("\n\x1b[32m✔ Setup complete. No setup artifacts remain.\x1b[0m");
}

main();
