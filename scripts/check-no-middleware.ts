#!/usr/bin/env bun

/**
 * Pre-commit hook: block middleware.ts/js files.
 *
 * Next.js 16+ replaces the `middleware` file convention with `proxy`.
 * Rename your file to proxy.ts (or proxy.js) and export a `proxy` function.
 * https://nextjs.org/docs/app/guides/upgrading/version-16#middleware-to-proxy
 */

import { execSync } from "node:child_process";

const MIDDLEWARE_PATTERN =
  /(?:^|\/)middleware\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/;

// Astro standalone sites define request middleware in src/middleware.ts by
// framework convention — there is no setting to rename it. The Next.js 16
// middleware→proxy rename this hook enforces does not apply to those sites,
// so exactly that path shape is exempt.
const ASTRO_SITE_MIDDLEWARE = /^sites\/[^/]+\/src\/middleware\.(ts|js)$/;
function getStagedFiles(): string[] {
  const output = execSync("git diff --cached --name-only --diff-filter=ACMR", {
    encoding: "utf8",
  }).trim();

  if (!output) return [];

  return output
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);
}

const violations = getStagedFiles().filter(
  (file) => MIDDLEWARE_PATTERN.test(file) && !ASTRO_SITE_MIDDLEWARE.test(file),
);

if (violations.length > 0) {
  console.error(
    "\nCommit blocked: middleware files are not supported in Next.js 16+.\n",
  );

  for (const file of violations) {
    const proxy = file.replace(/middleware(\.[^.]+)$/, "proxy$1");
    console.error(`  x ${file}`);
    console.error(`    -> rename to: ${proxy}`);
    console.error("    -> rename exported function: middleware -> proxy");
  }

  console.error(
    '\nNext.js 16 replaced the "middleware" convention with "proxy".',
  );
  console.error(
    "See: https://nextjs.org/docs/app/guides/upgrading/version-16#middleware-to-proxy\n",
  );

  process.exit(1);
}
