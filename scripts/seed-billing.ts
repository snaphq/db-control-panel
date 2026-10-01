#!/usr/bin/env tsx
/**
 * Seed default plan tiers and backfill org_billing rows for existing orgs.
 * Also seeds pricing plan display fields.
 * Run with: bun run db:seed:billing
 *
 * Idempotent: safe to run multiple times.
 */

import { resolve } from "node:path";
import { config } from "dotenv";
import { colors } from "./lib/colors";
import seedPricingPlans from "./seed-pricing-plans";

config({ path: resolve(process.cwd(), ".env.local") });

const DEFAULT_TIERS = [
  { key: "free", displayName: "Free", isPaid: false, sortOrder: 0 },
  { key: "tier1", displayName: "Pro", isPaid: true, sortOrder: 1 },
  { key: "tier2", displayName: "Business", isPaid: true, sortOrder: 2 },
  { key: "tier3", displayName: "Enterprise", isPaid: true, sortOrder: 3 },
];

async function main() {
  console.log("");
  console.log(`${colors.bold}${colors.cyan}  Billing Seed${colors.reset}`);
  console.log("");

  const { db, eq } = await import("@repo/database");
  const { organization, orgBilling, planTier } = await import(
    "@repo/database/schema"
  );
  const { nanoid } = await import("nanoid");

  // 1. Seed default plan tiers (skip if key already exists)
  let tiersInserted = 0;
  for (const tier of DEFAULT_TIERS) {
    const existing = await db()
      .select()
      .from(planTier)
      .where(eq(planTier.key, tier.key))
      .limit(1);

    if (existing.length === 0) {
      await db()
        .insert(planTier)
        .values({ id: nanoid(), ...tier });
      tiersInserted++;
      console.log(
        `${colors.green}  + tier:${colors.reset} ${tier.key} (${tier.displayName})`,
      );
    } else {
      console.log(
        `${colors.dim}  · tier:${colors.reset} ${tier.key} already exists`,
      );
    }
  }

  // 2. Backfill org_billing rows for orgs missing one
  const orgs = await db()
    .select({ id: organization.id, name: organization.name })
    .from(organization);
  const existingBilling = await db()
    .select({ organizationId: orgBilling.organizationId })
    .from(orgBilling);
  const existingIds = new Set(existingBilling.map((r) => r.organizationId));

  let billingInserted = 0;
  for (const org of orgs) {
    if (existingIds.has(org.id)) {
      continue;
    }
    await db().insert(orgBilling).values({
      id: nanoid(),
      organizationId: org.id,
      planTier: "free",
      planStatus: "active",
    });
    billingInserted++;
    console.log(
      `${colors.green}  + org_billing:${colors.reset} ${org.name} (${org.id})`,
    );
  }

  console.log("");
  console.log(
    `${colors.bold}  Summary:${colors.reset} ${tiersInserted} tier(s), ${billingInserted} org_billing row(s) inserted`,
  );
  console.log("");

  // Seed pricing plan display fields
  await seedPricingPlans();
}

main().catch((error) => {
  console.error(`${colors.red}  Billing seed failed:${colors.reset}`, error);
  process.exit(1);
});
