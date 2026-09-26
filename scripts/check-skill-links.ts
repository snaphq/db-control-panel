#!/usr/bin/env bun

/**
 * Pre-commit hook: keep `.claude/skills/` a mirror of `.agents/skills/`.
 *
 * Every skill lives in `.agents/skills/<name>/` and is exposed to Claude Code
 * through a relative symlink `.claude/skills/<name> -> ../../.agents/skills/<name>`.
 * Real directories or dangling links in `.claude/skills/` are rejected.
 */

import {
  existsSync,
  lstatSync,
  readdirSync,
  readlinkSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

const AGENTS_DIR = ".agents/skills";
const CLAUDE_DIR = ".claude/skills";

function listDir(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

const errors: string[] = [];

const skills = listDir(AGENTS_DIR).filter((name) =>
  statSync(join(AGENTS_DIR, name)).isDirectory(),
);

for (const name of skills) {
  if (!existsSync(join(AGENTS_DIR, name, "SKILL.md"))) {
    errors.push(`${AGENTS_DIR}/${name} has no SKILL.md`);
  }
  const linkPath = join(CLAUDE_DIR, name);
  const expected = `../../${AGENTS_DIR}/${name}`;
  let stat: ReturnType<typeof lstatSync> | undefined;
  try {
    stat = lstatSync(linkPath);
  } catch {
    errors.push(`missing symlink: ln -s ${expected} ${linkPath}`);
    continue;
  }
  if (!stat.isSymbolicLink()) {
    errors.push(
      `${linkPath} must be a symlink to ${expected}, not a real path`,
    );
  } else if (readlinkSync(linkPath) !== expected) {
    errors.push(
      `${linkPath} points to ${readlinkSync(linkPath)}, expected ${expected}`,
    );
  }
}

const skillSet = new Set(skills);
for (const name of listDir(CLAUDE_DIR)) {
  if (!skillSet.has(name)) {
    errors.push(
      `${CLAUDE_DIR}/${name} has no source in ${AGENTS_DIR}/ — move it there and symlink it back`,
    );
  }
}

if (errors.length > 0) {
  console.error("Skill link check failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
