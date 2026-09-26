#!/usr/bin/env bun
/**
 * Hard-code the Vercel org id and each app's Vercel project id into the
 * deploy workflows (.github/workflows/deploy-vercel.yml and
 * deploy-vercel-preview.yml). Rows left without a project id are skipped by
 * the workflows.
 *
 * Usage:
 *   bun .agents/skills/setup/scripts/set-vercel-projects.ts \
 *     --org team_abc123 \
 *     --project backend=prj_111 --project site-a=prj_222 --project site-b=
 *
 * --org       Vercel team/org id (team_… or the personal account id)
 * --project   <app>=<project id>; <app> is a matrix `app:` value. An empty
 *             id disables that app's deploys. Apps not passed keep their
 *             current value.
 * --list      print the current matrix rows and exit
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { colors } from "../../../../scripts/lib/colors";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../../..");
const WORKFLOWS = [
  ".github/workflows/deploy-vercel.yml",
  ".github/workflows/deploy-vercel-preview.yml",
];
const ORG_PATTERN = /(vercel_org_id: )'[^']*'/;
const ROW_PATTERN =
  /(- app: ([A-Za-z0-9._-]+)\n(?:[ \t]+(?!- app:)[^\n]*\n)*?[ \t]+project_id: )'([^']*)'/g;

function fail(message: string): never {
  console.error(`${colors.red}✖ ${message}${colors.reset}`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const projects = new Map<string, string>();
  let org: string | undefined;
  let list = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--list") list = true;
    else if (arg === "--org") org = argv[++i] ?? fail("--org needs a value");
    else if (arg === "--project") {
      const pair = argv[++i] ?? fail("--project needs app=id");
      const eq = pair.indexOf("=");
      if (eq <= 0) fail(`--project expects app=id, got "${pair}"`);
      projects.set(pair.slice(0, eq), pair.slice(eq + 1).trim());
    } else fail(`Unknown argument: ${arg}`);
  }
  return { org, projects, list };
}

function rows(content: string): Map<string, string> {
  return new Map(
    [...content.matchAll(ROW_PATTERN)].map((match) => [match[2], match[3]]),
  );
}

function main(): void {
  const { org, projects, list } = parseArgs(process.argv.slice(2));
  if (org !== undefined && !/^[A-Za-z0-9_-]+$/.test(org)) {
    fail(`Invalid --org value: ${org}`);
  }
  for (const [app, id] of projects) {
    if (id && !/^prj_[A-Za-z0-9]+$/.test(id)) {
      fail(`Invalid project id for ${app}: ${id} (expected prj_…)`);
    }
  }

  for (const file of WORKFLOWS) {
    const path = resolve(ROOT, file);
    const content = readFileSync(path, "utf8");
    const current = rows(content);
    if (list) {
      console.log(file);
      for (const [app, id] of current)
        console.log(`  ${app}: ${id || "(skipped)"}`);
      continue;
    }
    for (const app of projects.keys()) {
      if (!current.has(app)) fail(`${file} has no matrix row for app "${app}"`);
    }
    let updated = content.replace(ROW_PATTERN, (match, prefix, app) =>
      projects.has(app) ? `${prefix}'${projects.get(app)}'` : match,
    );
    if (org !== undefined) {
      if (!ORG_PATTERN.test(updated)) fail(`${file} has no vercel_org_id`);
      updated = updated.replace(ORG_PATTERN, `$1'${org}'`);
    }
    writeFileSync(path, updated);
    console.log(`${colors.green}✔${colors.reset} updated ${file}`);
  }
}

main();
