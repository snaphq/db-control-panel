#!/usr/bin/env bun
/**
 * Create or update the tenant (and primary domain) for every site in sites/*
 * from its src/site.config.ts. Safe to re-run.
 *
 * Run with: bun run db:seed:sites
 */

import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import type { SiteConfig } from "../packages/site-kit/src/site-config";
import { colors } from "./lib/colors";

config({ path: resolve(process.cwd(), ".env.local") });

async function loadSiteConfigs(): Promise<SiteConfig[]> {
  const sitesDir = resolve(process.cwd(), "sites");
  const configs: SiteConfig[] = [];
  for (const name of readdirSync(sitesDir).sort()) {
    const file = resolve(sitesDir, name, "src/site.config.ts");
    if (!existsSync(file)) continue;
    const mod = (await import(file)) as { siteConfig?: SiteConfig };
    if (!mod.siteConfig) {
      throw new Error(`${file} does not export siteConfig`);
    }
    configs.push(mod.siteConfig);
  }
  return configs;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (expected in .env.local)");
  }
  const { DEFAULT_TENANT_ID, ensureDefaultTenant } = await import(
    "@repo/database"
  );
  const defaultTenantId =
    process.env.DEFAULT_TENANT_ID?.trim() || DEFAULT_TENANT_ID;

  const sites = await loadSiteConfigs();
  const seen = new Map<string, string>();
  for (const site of sites) {
    const owner = seen.get(site.tenantId);
    if (owner) {
      throw new Error(
        `${site.id} and ${owner} both claim tenant "${site.tenantId}"`,
      );
    }
    seen.set(site.tenantId, site.id);

    // The default tenant keeps its DEFAULT_TENANT_* branding from .env.local;
    // other tenants must not inherit it.
    const inheritsEnv = site.tenantId === defaultTenantId;
    const tenant = await ensureDefaultTenant({
      id: site.tenantId,
      slug: site.tenantSlug,
      name: site.name,
      platformName: site.name,
      domain: site.domain,
      ...(inheritsEnv
        ? {}
        : {
            supportEmail: undefined,
            logoUrl: undefined,
            faviconUrl: undefined,
          }),
    });
    console.log(
      `${colors.green}✓${colors.reset} ${site.id} → tenant ${colors.bold}${tenant?.id}${colors.reset} (${site.domain})`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(
      `${colors.red}Seeding site tenants failed:${colors.reset}`,
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
