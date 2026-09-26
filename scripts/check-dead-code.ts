#!/usr/bin/env bun

/**
 * Dead-code gate backed by fallow and knip, ratcheted against shrink-only
 * baselines in scripts/dead-code-baseline/.
 *
 * Usage:
 *   bun run check:dead-code                     # both tools vs baselines
 *   bun run check:dead-code --staged            # fallow; only staged files fail
 *   bun run check:dead-code --tool=knip         # one tool
 *   bun run check:dead-code --update-baseline   # rewrite baselines from current
 *   bun run check:dead-code --strict            # ignore baselines entirely
 *   bun run check:dead-code --no-growth=<ref>   # fail if a baseline grew vs ref
 */

import { execFileSync } from "node:child_process";
import { colors } from "./lib/colors";
import {
  TOOLS,
  type Tool,
  baselinePath,
  fileOfKey,
  parseBaseline,
  readBaseline,
  runTool,
  writeBaseline,
} from "./lib/dead-code";

interface Flags {
  tools: Tool[];
  staged: boolean;
  update: boolean;
  strict: boolean;
  growthRef?: string;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    tools: [...TOOLS],
    staged: false,
    update: false,
    strict: false,
  };
  for (const arg of argv) {
    if (arg === "--staged") {
      flags.staged = true;
      flags.tools = ["fallow"];
    } else if (arg === "--update-baseline") flags.update = true;
    else if (arg === "--strict") flags.strict = true;
    else if (arg.startsWith("--tool=")) {
      const tool = arg.slice("--tool=".length) as Tool;
      if (!TOOLS.includes(tool)) throw new Error(`Unknown tool: ${tool}`);
      flags.tools = [tool];
    } else if (arg.startsWith("--no-growth=")) {
      flags.growthRef = arg.slice("--no-growth=".length);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return flags;
}

function stagedFiles(): Set<string> {
  const output = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { encoding: "utf8" },
  );
  return new Set(output.split("\n").filter(Boolean));
}

function printGrouped(title: string, keys: string[]): void {
  console.log(`${colors.red}${colors.bold}${title}${colors.reset}`);
  const byFile = new Map<string, string[]>();
  for (const key of keys) {
    const [category, file, name] = key.split("|");
    const list = byFile.get(file) ?? [];
    list.push(`${category}: ${name}`);
    byFile.set(file, list);
  }
  for (const [file, issues] of byFile) {
    console.log(`  ${colors.cyan}${file}${colors.reset}`);
    for (const issue of issues) console.log(`    - ${issue}`);
  }
}

function checkGrowth(ref: string, tools: Tool[]): boolean {
  let ok = true;
  for (const tool of tools) {
    let before: string[] = [];
    try {
      before = parseBaseline(
        execFileSync("git", ["show", `${ref}:${baselinePath(tool)}`], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }),
      );
    } catch {
      continue; // baseline did not exist at ref
    }
    const previous = new Set(before);
    const added = readBaseline(tool).filter((key) => !previous.has(key));
    if (added.length > 0) {
      ok = false;
      printGrouped(`${tool} baseline grew vs ${ref} (fix, don't baseline):`, [
        ...added,
      ]);
    }
  }
  return ok;
}

function main(): void {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.growthRef) {
    if (!checkGrowth(flags.growthRef, flags.tools)) process.exit(1);
    console.log(
      `${colors.green}Dead-code baselines did not grow.${colors.reset}`,
    );
    return;
  }

  const staged = flags.staged ? stagedFiles() : undefined;
  let failed = false;

  for (const tool of flags.tools) {
    const current = runTool(tool);

    if (flags.update) {
      writeBaseline(tool, current);
      console.log(`Wrote ${baselinePath(tool)} (${current.length} findings)`);
      continue;
    }

    const baseline = new Set(flags.strict ? [] : readBaseline(tool));
    const currentSet = new Set(current);
    let regressions = current.filter((key) => !baseline.has(key));
    if (staged)
      regressions = regressions.filter((k) => staged.has(fileOfKey(k)));
    const resolved = [...baseline].filter((key) => !currentSet.has(key));

    if (regressions.length > 0) {
      failed = true;
      printGrouped(
        `${tool}: ${regressions.length} new dead-code finding(s)`,
        regressions,
      );
      console.log(
        `${colors.dim}  Remove the unused code, or wire it up. Investigate with \`bunx fallow dead-code --trace <file>:<export>\`.${colors.reset}`,
      );
    } else {
      console.log(`${colors.green}${tool}: no new dead code${colors.reset}`);
    }
    if (resolved.length > 0 && !flags.strict) {
      console.log(
        `${colors.yellow}${tool}: ${resolved.length} baseline finding(s) resolved — run \`bun run check:dead-code --update-baseline\` to shrink it.${colors.reset}`,
      );
    }
  }

  if (failed) process.exit(1);
}

main();
