#!/usr/bin/env bun

import { execFileSync } from "node:child_process";

const IGNORED_PREFIXES = [".agents/", ".claude/"];
const ALLOWED_DOC_ROOTS = ["docs-public/", "docs-internal/"];
// The shared /docs route (in @repo/site-kit) and each site's generated route
// shim render docs-public; they are not hand-maintained documentation trees.
const GENERATED_DOC_PATHS = [
  /^packages\/site-kit\/src\/app\/docs\//,
  /^sites\/[^/]+\/src\/app\/docs\//,
];

function getStagedFiles(): string[] {
  const output = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { encoding: "utf8" },
  ).trim();

  if (!output) return [];

  return output
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);
}

const violations = getStagedFiles().filter((file) => {
  if (IGNORED_PREFIXES.some((prefix) => file.startsWith(prefix))) {
    return false;
  }

  if (ALLOWED_DOC_ROOTS.some((prefix) => file.startsWith(prefix))) {
    return false;
  }

  if (GENERATED_DOC_PATHS.some((pattern) => pattern.test(file))) {
    return false;
  }

  return /(^|\/)docs(?:\/|$)/.test(file);
});

if (violations.length > 0) {
  console.error("\nCommit blocked: generic docs/ paths are not allowed.\n");
  for (const file of violations) {
    console.error(`  x ${file}`);
  }
  console.error(
    "\nUse docs-public/ for public documentation or docs-internal/ for developer and agent documentation.\n",
  );
  process.exit(1);
}
