/**
 * Normalizers that turn fallow and knip JSON output into stable finding keys
 * of the form `<category>|<file>|<name>`. Line numbers are deliberately left
 * out so unrelated edits do not churn the baselines.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export type Tool = "fallow" | "knip";

export const TOOLS: Tool[] = ["fallow", "knip"];

export const BASELINE_DIR = "scripts/dead-code-baseline";

export function baselinePath(tool: Tool): string {
  return `${BASELINE_DIR}/${tool}.json`;
}

type Json = Record<string, unknown>;

const FALLOW_SKIP_KEYS = new Set(["entry_points", "next_steps", "_meta"]);

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function pathsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) =>
      typeof entry === "string" ? entry : asString((entry as Json)?.path),
    )
    .filter((entry): entry is string => Boolean(entry))
    .sort();
}

function fallowKey(category: string, item: Json): string {
  const member =
    asString(item.parent_name) && asString(item.member_name)
      ? `${item.parent_name}.${item.member_name}`
      : undefined;
  const name =
    asString(item.export_name) ??
    asString(item.package_name) ??
    member ??
    asString(item.action_name) ??
    asString(item.specifier) ??
    asString(item.member_name) ??
    "-";

  // Unlisted dependencies are keyed by package: their importer list changes
  // whenever a new file imports the same missing package.
  if (category === "unlisted_dependencies") return `${category}|-|${name}`;

  const file =
    asString(item.path) ??
    (pathsOf(item.files).join(",") || pathsOf(item.locations).join(",") || "-");
  return `${category}|${file}|${name}`;
}

export function normalizeFallow(report: Json): string[] {
  const keys = new Set<string>();
  for (const [category, value] of Object.entries(report)) {
    if (FALLOW_SKIP_KEYS.has(category) || !Array.isArray(value)) continue;
    for (const item of value) keys.add(fallowKey(category, item as Json));
  }
  return [...keys].sort();
}

export function normalizeKnip(report: Json): string[] {
  const keys = new Set<string>();
  const issues = Array.isArray(report.issues) ? report.issues : [];
  for (const issue of issues as Json[]) {
    const file = asString(issue.file) ?? "-";
    for (const [category, value] of Object.entries(issue)) {
      if (!Array.isArray(value)) continue;
      for (const entry of value as Json[]) {
        const name = Array.isArray(entry)
          ? pathsOf(entry.map((part) => (part as Json).name)).join(",")
          : (asString(entry?.name) ?? "-");
        keys.add(`${category}|${file}|${name}`);
      }
    }
  }
  return [...keys].sort();
}

/** Parse the last JSON object line; config loaders may print to stdout. */
function parseJsonOutput(tool: Tool, output: string): Json {
  const line = output
    .split("\n")
    .reverse()
    .find((candidate) => candidate.trimStart().startsWith("{"));
  if (!line) {
    throw new Error(`${tool} produced no JSON output:\n${output.slice(-2000)}`);
  }
  return JSON.parse(line) as Json;
}

function localBin(name: string): string {
  const bin = resolve(process.cwd(), "node_modules", ".bin", name);
  if (!existsSync(bin)) {
    throw new Error(`${name} is not installed. Run \`bun install\` first.`);
  }
  return bin;
}

export function runTool(tool: Tool): string[] {
  const env = { ...process.env, DOTENV_CONFIG_QUIET: "true", NO_COLOR: "1" };
  const args =
    tool === "fallow"
      ? ["dead-code", "--format", "json", "--quiet"]
      : ["--reporter", "json", "--no-exit-code", "--no-progress"];

  let output: string;
  try {
    output = execFileSync(localBin(tool), args, {
      encoding: "utf8",
      env,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    // fallow exits non-zero when it finds issues; its JSON is still on stdout.
    const stdout = (error as { stdout?: string }).stdout;
    if (!stdout) throw error;
    output = stdout;
  }

  const report = parseJsonOutput(tool, output);
  return tool === "fallow" ? normalizeFallow(report) : normalizeKnip(report);
}

export function parseBaseline(raw: string): string[] {
  const parsed = JSON.parse(raw) as { findings?: unknown };
  return Array.isArray(parsed.findings) ? (parsed.findings as string[]) : [];
}

export function readBaseline(tool: Tool): string[] {
  const path = baselinePath(tool);
  if (!existsSync(path)) return [];
  return parseBaseline(readFileSync(path, "utf8"));
}

export function writeBaseline(tool: Tool, findings: string[]): void {
  const body = {
    tool,
    note: "Shrink-only. Regenerate with `bun run check:dead-code --update-baseline` after fixing findings; never add entries by hand.",
    findings: [...findings].sort(),
  };
  writeFileSync(baselinePath(tool), `${JSON.stringify(body, null, 2)}\n`);
}

export function fileOfKey(key: string): string {
  return key.split("|")[1] ?? "-";
}
