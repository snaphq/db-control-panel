#!/usr/bin/env bun

/**
 * Pre-commit hook: block unexpected .md files in the repo root.
 *
 * Documentation belongs in docs-public/ or docs-internal/.
 * Only a curated allowlist of root-level markdown files is permitted.
 */

import { execFileSync } from "node:child_process";

const ALLOWED = new Set([
  "README.md",
  "CLAUDE.md",
  "AGENTS.md",
  "GEMINI.md",
  "LICENCE.md",
  // setup:start
  "SETUP.md",
  // setup:end
]);

function getStagedFiles(): string[] {
  const output = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { encoding: "utf8" },
  ).trim();

  if (!output) return [];

  return output
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
}

const violations = getStagedFiles().filter((file) => {
  const isRootMd = /^[^/]+\.md$/i.test(file);
  return isRootMd && !ALLOWED.has(file);
});

if (violations.length > 0) {
  console.error("\nCommit blocked: unexpected .md file(s) in the repo root.\n");

  for (const file of violations) {
    console.error(`  x ${file}`);
  }

  console.error("\nMove documentation into docs-public/ or docs-internal/.");
  console.error(`Allowed root-level files: ${[...ALLOWED].join(", ")}\n`);

  process.exit(1);
}
