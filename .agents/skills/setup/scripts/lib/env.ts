import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureTrailingNewline(content: string): string {
  if (!content) return "";
  return content.endsWith("\n") ? content : `${content}\n`;
}

export function parseEnvFile(content: string): Map<string, string> {
  const env = new Map<string, string>();
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      env.set(key, value);
    }
  }

  return env;
}

interface UpdateEnvFileOptions {
  envPath?: string;
  sectionName?: string;
  sectionTitle?: string;
}

export function updateEnvFile(
  updates: Record<string, string>,
  options: UpdateEnvFileOptions = {},
): void {
  const envPath = options.envPath ?? resolve(process.cwd(), ".env.local");
  let content = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const existingEnv = parseEnvFile(content);
  const pendingInsertions: Array<[string, string]> = [];

  for (const [key, value] of Object.entries(updates)) {
    if (existingEnv.has(key)) {
      const regex = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");
      content = content.replace(regex, `${key}=${value}`);
    } else {
      pendingInsertions.push([key, value]);
    }
  }

  if (pendingInsertions.length > 0) {
    const insertion = `${pendingInsertions
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`;

    if (options.sectionName) {
      const sectionAnchor = `# ${options.sectionName}`;
      const sectionIndex = content.indexOf(sectionAnchor);

      if (sectionIndex !== -1) {
        const nextSection = content.indexOf("\n# ", sectionIndex + 1);
        const insertPos = nextSection !== -1 ? nextSection : content.length;
        content = `${content.slice(0, insertPos)}${insertion}${content.slice(insertPos)}`;
      } else {
        const title = options.sectionTitle ?? options.sectionName;
        content = ensureTrailingNewline(content);
        content += `\n# ${"=".repeat(44)}\n# ${title}\n# ${"=".repeat(44)}\n${insertion}`;
      }
    } else {
      content = `${ensureTrailingNewline(content)}${insertion}`;
    }
  }

  writeFileSync(envPath, content, "utf-8");
}
