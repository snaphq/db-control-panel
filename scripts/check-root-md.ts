#!/usr/bin/env bun

/**
 * Pre-commit hook: block unexpected .md files in the repo root.
 *
 * Documentation belongs in docs-public/ or docs-internal/.
 * Only a curated allowlist of root-level markdown files is permitted.
 * Agent instructions live in AGENTS.md only: tool-specific files such as
 * CLAUDE.md and GEMINI.md are rejected anywhere in the repository.
 */

import { execFileSync } from "node:child_process";

const ALLOWED = new Set([
  "README.md",
  "AGENTS.md",
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

// Tool-specific agent instruction files, blocked at any depth in favor of
// AGENTS.md.
const AGENT_FILE_ALTERNATIVES = /(^|\/)(CLAUDE|GEMINI)\.md$/i;

const stagedFiles = getStagedFiles();

const agentFiles = stagedFiles.filter((file) =>
  AGENT_FILE_ALTERNATIVES.test(file),
);
if (agentFiles.length > 0) {
  console.error("\nCommit blocked: CLAUDE.md and GEMINI.md are not allowed.\n");
  for (const file of agentFiles) {
    console.error(`  x ${file}`);
  }
  console.error("\nPut agent instructions in AGENTS.md instead.\n");
  process.exit(1);
}

const violations = stagedFiles.filter((file) => {
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
