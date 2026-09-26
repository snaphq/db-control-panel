#!/usr/bin/env bun

import { execSync, spawnSync } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const TYPE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const cwd = process.cwd();
function runGitCommand(command: string): string {
  return execSync(command, { encoding: "utf8" }).trim();
}

function getStagedFiles(): string[] {
  const output = runGitCommand(
    "git diff --cached --name-only --diff-filter=ACMR",
  );
  if (!output) return [];

  return output
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);
}

function hasTypeExtension(filePath: string): boolean {
  return TYPE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function normalize(filePath: string): string {
  return path.normalize(path.resolve(filePath));
}

function findNearestTsconfig(filePath: string): string | null {
  let current = path.dirname(normalize(filePath));
  const root = normalize(cwd);

  while (true) {
    const candidate = path.join(current, "tsconfig.json");
    if (existsSync(candidate)) return candidate;

    if (current === root) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const rootTsconfig = path.join(root, "tsconfig.json");
  return existsSync(rootTsconfig) ? rootTsconfig : null;
}

function groupFilesByTsconfig(files: string[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const file of files) {
    const tsconfigPath = findNearestTsconfig(file);
    if (!tsconfigPath) continue;

    const existing = grouped.get(tsconfigPath) ?? [];
    existing.push(file);
    grouped.set(tsconfigPath, existing);
  }

  return grouped;
}

function pathMatchesStagedFile(line: string, stagedFiles: string[]): boolean {
  const normalizedLine = line.replace(/\\/g, "/");

  return stagedFiles.some((file) => {
    const relative = file.replace(/\\/g, "/");
    const absolute = normalize(file).replace(/\\/g, "/");
    return (
      normalizedLine.includes(`${relative}:`) ||
      normalizedLine.includes(`${relative}(`) ||
      normalizedLine.includes(`${absolute}:`) ||
      normalizedLine.includes(`${absolute}(`)
    );
  });
}

function filterDiagnostics(
  output: string,
  stagedFiles: string[],
  temporaryConfigPath: string,
): string[] {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  const normalizedConfigPath = temporaryConfigPath.replace(/\\/g, "/");
  const relevant = lines.filter((line) => {
    const normalizedLine = line.replace(/\\/g, "/");
    return (
      pathMatchesStagedFile(line, stagedFiles) ||
      normalizedLine.includes(normalizedConfigPath) ||
      /^error TS\d+\b/.test(line)
    );
  });

  return relevant.length > 0 ? relevant : lines;
}

let temporaryConfigCounter = 0;

function checkFileGroup(tsconfigPath: string, stagedFiles: string[]): string[] {
  const temporaryConfigPath = path.join(
    path.dirname(tsconfigPath),
    `.tsconfig.staged-${process.pid}-${temporaryConfigCounter++}.json`,
  );

  const temporaryConfig = {
    extends: `./${path.basename(tsconfigPath)}`,
    compilerOptions: {
      noEmit: true,
      incremental: false,
      composite: false,
      types: ["node"],
    },
    files: stagedFiles.map(normalize),
    include: [],
    exclude: [],
  };

  writeFileSync(
    temporaryConfigPath,
    `${JSON.stringify(temporaryConfig, null, 2)}\n`,
  );

  try {
    const result = spawnSync(
      "bun",
      ["x", "tsc", "--project", temporaryConfigPath, "--pretty", "false"],
      { cwd, encoding: "utf8" },
    );

    if (result.status === 0) return [];

    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    return filterDiagnostics(output, stagedFiles, temporaryConfigPath);
  } finally {
    unlinkSync(temporaryConfigPath);
  }
}

const stagedFiles = getStagedFiles();
const stagedTypeFiles = stagedFiles.filter(
  (file) => hasTypeExtension(file) && existsSync(file),
);

if (stagedTypeFiles.length === 0) {
  process.exit(0);
}

const groupedFiles = groupFilesByTsconfig(stagedTypeFiles);
const errors: string[] = [];

for (const [tsconfigPath, files] of groupedFiles.entries()) {
  const groupErrors = checkFileGroup(tsconfigPath, files);
  errors.push(...groupErrors);
}

if (errors.length > 0) {
  console.error(
    "\nCommit blocked: staged TypeScript files contain type errors.\n",
  );
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}
