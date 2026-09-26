#!/usr/bin/env tsx
/**
 * Seed script to create the initial admin user
 * Run with: bun run db:seed
 */

import { resolve } from "node:path";
import { select } from "@inquirer/prompts";
import bcrypt from "bcryptjs";
import { config } from "dotenv";
import { nanoid } from "nanoid";

// Load .env.local
config({ path: resolve(process.cwd(), ".env.local") });

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

async function main() {
  const adminName = process.env.ADMIN_NAME;
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  console.log("");
  console.log(
    `${colors.bold}${colors.cyan}  Admin User Seeding${colors.reset}`,
  );
  console.log("");

  // Validate required env vars
  if (!adminEmail || !adminPassword) {
    console.log(
      `${colors.yellow}  No admin credentials found in .env.local${colors.reset}`,
    );
    console.log(
      `${colors.dim}  Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD in .env.local.${colors.reset}`,
    );
    console.log("");
    process.exit(0);
  }

  if (!adminName) {
    console.log(`${colors.red}  ADMIN_NAME is required${colors.reset}`);
    process.exit(1);
  }

  // Dynamic imports to avoid loading db before env is configured
  const { buildTenantAuthEmail, db, ensureDefaultTenant, eq } = await import(
    "@repo/database"
  );
  const { user, account } = await import("@repo/database/schema");
  const defaultTenant = await ensureDefaultTenant();
  const normalizedAdminEmail = adminEmail.toLowerCase().trim();
  const authEmail = buildTenantAuthEmail(
    defaultTenant.id,
    normalizedAdminEmail,
  );

  // Check if user already exists
  const existingUser = await db()
    .select()
    .from(user)
    .where(eq(user.email, authEmail))
    .limit(1);

  if (existingUser.length > 0) {
    const existing = existingUser[0];

    if (existing.role === "site-admin") {
      console.log(
        `${colors.green}  ✅ Admin user already exists: ${normalizedAdminEmail}${colors.reset}`,
      );
      console.log("");
      process.exit(0);
    }

    // User exists but not admin - ask what to do
    console.log(
      `${colors.yellow}  User already exists: ${normalizedAdminEmail} (role: ${existing.role})${colors.reset}`,
    );
    console.log("");

    const action = await select({
      message: "What would you like to do?",
      choices: [
        {
          value: "promote",
          name: "Promote to admin (update role to site-admin)",
        },
        { value: "skip", name: "Skip (keep existing role)" },
        { value: "cancel", name: "Cancel" },
      ],
    });

    if (action === "cancel") {
      console.log("");
      console.log(`${colors.dim}  Seeding cancelled.${colors.reset}`);
      console.log("");
      process.exit(0);
    }

    if (action === "promote") {
      await db()
        .update(user)
        .set({ role: "site-admin" })
        .where(eq(user.id, existing.id));

      console.log("");
      console.log(
        `${colors.green}  ✅ User promoted to admin: ${normalizedAdminEmail}${colors.reset}`,
      );
      console.log("");
      process.exit(0);
    }

    // skip
    console.log("");
    console.log(`${colors.dim}  Skipped. No changes made.${colors.reset}`);
    console.log("");
    process.exit(0);
  }

  // Create new admin user
  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  const userId = nanoid();

  await db().insert(user).values({
    id: userId,
    tenantId: defaultTenant.id,
    name: adminName,
    publicEmail: normalizedAdminEmail,
    email: authEmail,
    emailVerified: true,
    role: "site-admin",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create account record for email/password auth
  await db().insert(account).values({
    id: nanoid(),
    tenantId: defaultTenant.id,
    userId: userId,
    accountId: userId,
    providerId: "credential",
    password: hashedPassword,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(
    `${colors.green}  ✅ Admin user created successfully${colors.reset}`,
  );
  console.log("");
  console.log(`${colors.bold}  Details:${colors.reset}`);
  console.log(`    Tenant: ${colors.cyan}${defaultTenant.name}${colors.reset}`);
  console.log(
    `    Email:  ${colors.cyan}${normalizedAdminEmail}${colors.reset}`,
  );
  console.log(`    Name:  ${adminName}`);
  console.log("    Role:  site-admin");
  console.log("");
  console.log(
    `${colors.dim}  You can now sign in at /sign-in and access /adminx${colors.reset}`,
  );
  console.log("");
}

main().catch((error) => {
  if (error.name === "ExitPromptError") {
    console.log("");
    console.log(`${colors.dim}  Seeding cancelled.${colors.reset}`);
    console.log("");
    process.exit(0);
  }
  console.error(`${colors.red}  Seeding failed:${colors.reset}`, error.message);
  process.exit(1);
});
