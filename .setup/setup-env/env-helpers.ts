import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { colors } from "../../scripts/lib/colors";
import type { EnvVariable } from "./types";

export const SECRET_KEYS = [
  "BETTER_AUTH_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "UPSTASH_REDIS_REST_TOKEN",
  "RESEND_API_KEY",
  "ADMIN_PASSWORD",
];

export const ENV_OVERRIDE_KEYS = [
  "DATABASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "RESEND_FROM_NAME",
  "ADMIN_NAME",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "ADMIN_EMAIL_DOMAINS",
];

export function generateSecret(length = 32): string {
  return randomBytes(length).toString("base64");
}

export function maskValue(value: string, isSecret = false): string {
  if (!value || value.length === 0) return "(empty)";
  if (!isSecret) return value;
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function printUpdateWarning(
  _key: string,
  oldValue: string,
  isSecret = false,
) {
  const masked = maskValue(oldValue, isSecret);
  console.log(`  ${colors.yellow}Current value: ${masked}${colors.reset}`);
}

export function syncDevPort(appUrl: string): boolean {
  try {
    const url = new URL(appUrl);
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return false;
    const port = url.port || (url.protocol === "https:" ? "443" : "80");

    const pkgPath = resolve(process.cwd(), "apps/next-app/package.json");
    if (!existsSync(pkgPath)) return false;

    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const currentDev: string = pkg?.scripts?.dev ?? "";
    const updated = currentDev.replace(/-p\s+\d+/, `-p ${port}`);

    if (updated === currentDev) return false;

    pkg.scripts.dev = updated;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");
    return true;
  } catch {
    return false;
  }
}

export function restoreRootDevScript(): boolean {
  try {
    const pkgPath = resolve(process.cwd(), "package.json");
    if (!existsSync(pkgPath)) return false;

    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const devScript = "turbo run dev --filter=@repo/next-app";
    if (pkg?.scripts?.dev === devScript) return false;

    pkg.scripts.dev = devScript;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");
    return true;
  } catch {
    return false;
  }
}

export function commitAndTag(): void {
  execFileSync("git", ["add", "-A"], { stdio: "inherit" });
  execFileSync("git", ["commit", "-m", "chore: initial setup complete"], {
    stdio: "inherit",
  });
  execFileSync("git", ["tag", "v0-setup-done"], { stdio: "inherit" });
}

export function generateEnvContent(variables: EnvVariable[]): string {
  const sections: Record<string, EnvVariable[]> = {};

  for (const variable of variables) {
    if (!sections[variable.section]) sections[variable.section] = [];
    sections[variable.section].push(variable);
  }

  const sectionOrder = [
    "Database",
    "Application",
    "BetterAuth",
    "Stripe",
    "Upstash",
    "Email",
    "Admin",
    "Other",
  ];

  let content = "";

  const writeSection = (name: string, items: EnvVariable[]) => {
    content += `# ${"=".repeat(44)}\n`;
    content += `# ${name}\n`;
    content += `# ${"=".repeat(44)}\n`;
    for (const item of items) content += `${item.key}=${item.value}\n`;
    content += "\n";
  };

  for (const name of sectionOrder) {
    const items = sections[name];
    if (items && items.length > 0) writeSection(name, items);
  }

  for (const [name, items] of Object.entries(sections)) {
    if (sectionOrder.includes(name) || items.length === 0) continue;
    writeSection(name, items);
  }

  return `${content.trim()}\n`;
}

export function envOverridesFromProcess(keys: string[]): Map<string, string> {
  const overrides = new Map<string, string>();
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== "") overrides.set(key, value);
  }
  return overrides;
}
