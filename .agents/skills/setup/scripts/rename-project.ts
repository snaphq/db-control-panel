#!/usr/bin/env bun
/**
 * Replace the template's placeholder name, slug, and production URL with the
 * project's own, across every tracked text file.
 *
 * Usage:
 *   bun .agents/skills/setup/scripts/rename-project.ts \
 *     --name "Acme CRM" --slug acme-crm [--url https://app.acme.com]
 *
 * --slug  lowercase letters, digits, and dashes; used for package names,
 *         the Inngest app id, MCP server names, and the Vercel alias
 * --url   production URL; defaults to https://<slug>.vercel.app
 *
 * Safe to re-run: once replaced, the placeholders no longer match.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

// Files that must keep the placeholders: the setup skills themselves (they
// are deleted by finalize) and generated files.
const SKIP = [
  /^\.agents\/skills\/setup/,
  /^\.agents\/tasks\//,
  /^bun\.lock$/,
  /^scripts\/dead-code-baseline\//,
];

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): {
  name: string;
  slug: string;
  url: string;
} {
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!["--name", "--slug", "--url"].includes(key) || value === undefined) {
      fail(`Unexpected argument: ${key}`);
    }
    values[key.slice(2)] = value;
  }
  const { name, slug } = values;
  if (!name?.trim()) fail("--name is required");
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    fail(
      "--slug is required and must be lowercase letters, digits, and dashes",
    );
  }
  const url = (values.url ?? `https://${slug}.vercel.app`).replace(/\/$/, "");
  try {
    new URL(url);
  } catch {
    fail(`--url is not a valid URL: ${url}`);
  }
  return { name: name.trim(), slug, url };
}

function replacements(
  name: string,
  slug: string,
  url: string,
): Array<[string, string]> {
  const host = new URL(url).host;
  // Longest and most specific first, so shorter patterns don't eat longer ones.
  return [
    ["https://nextjs-starter-kit-app.vercel.app", url],
    ["nextjs-starter-kit-app.vercel.app", host],
    ["nextjs-starter-kit-admin-mcp", `${slug}-admin-mcp`],
    ["nextjs-starter-kit-mcp", `${slug}-mcp`],
    ["nextjs16-starter-kit", slug],
    ["nextjs-starter-kit", slug],
    ["nextjs-starter-monorepo", slug],
    ["nextjs-starter", slug],
    ["nextjs_starter", slug.replace(/-/g, "_")],
    ["Next.js 16 Starter Kit Internal Docs", `${name} Internal Docs`],
    ["Next.js 16 SaaS Monorepo", name],
    ["Next.js 16 Starter Kit", name],
    ["Nextjs 16 Starter Template", name],
    ["Nextjs Starter Kit", name],
    ["NextJS Starter MCP", `${name} MCP`],
    ["Starter kit marketing video", `${name} marketing video`],
    ["Next Starter", name],
  ];
}

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\0")
    .filter((file) => file && !SKIP.some((pattern) => pattern.test(file)));
}

function main(): void {
  const { name, slug, url } = parseArgs(process.argv.slice(2));
  const pairs = replacements(name, slug, url);
  const changed: string[] = [];

  for (const file of trackedFiles()) {
    const path = join(ROOT, file);
    let content: string;
    try {
      content = readFileSync(path, "utf8");
    } catch {
      continue; // deleted in the working tree, or a directory symlink
    }
    if (content.includes("\0")) continue; // binary
    let next = content;
    for (const [from, to] of pairs) next = next.split(from).join(to);
    if (next !== content) {
      writeFileSync(path, next);
      changed.push(file);
    }
  }

  console.log(
    `Renamed to "${name}" (${slug}, ${url}) in ${changed.length} file(s):`,
  );
  for (const file of changed) console.log(`  ${file}`);
}

main();
