import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { tenant } from "./schema-tenant";
export { planTier } from "./schema-plan-tier";
export type { PlanTier, NewPlanTier } from "./schema-plan-tier";
export { tenant, tenantDomain } from "./schema-tenant";
export type {
  Tenant,
  NewTenant,
  TenantDomain,
  NewTenantDomain,
} from "./schema-tenant";

// BetterAuth tables
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("default")
      .references(() => tenant.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    publicEmail: text("public_email").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    username: text("username"),
    role: text("role").notNull().default("user"),
    twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("user_tenant_public_email_unique").on(
      table.tenantId,
      table.publicEmail,
    ),
    uniqueIndex("user_tenant_username_unique").on(
      table.tenantId,
      table.username,
    ),
  ],
);

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .default("default")
    .references(() => tenant.id, { onDelete: "restrict" }),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => new Date())
    .notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .default("default")
    .references(() => tenant.id, { onDelete: "restrict" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => new Date())
    .notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .default("default")
    .references(() => tenant.id, { onDelete: "cascade" }),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Existing application tables
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  created_time: timestamp("created_time").defaultNow().notNull(),
  payment: varchar("payment", { length: 255 }).notNull(),
  type: varchar("type", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  amount: varchar("amount", { length: 255 }).notNull(),
  payment_time: varchar("payment_time", { length: 255 }).notNull(),
  payment_date: varchar("payment_date", { length: 255 }).notNull(),
  receipt_email: varchar("receipt_email", { length: 255 }).notNull(),
  receipt_url: varchar("receipt_url", { length: 500 }).notNull(),
  payment_details: varchar("payment_details", { length: 5000 }).notNull(),
  billing_details: varchar("billing_details", { length: 5000 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull(),
});

export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("default")
      .references(() => tenant.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logo: text("logo"),
    stripeCustomerId: text("stripe_customer_id"),
    status: text("status").notNull().default("active"), // pending | active | readonly | suspended
    invoiceEmail: varchar("invoice_email", { length: 254 }),
    companyName: varchar("company_name", { length: 64 }),
    billingCountry: varchar("billing_country", { length: 2 }),
    billingAddress: text("billing_address"),
    invoiceLanguage: varchar("invoice_language", { length: 10 })
      .notNull()
      .default("en"),
    invoicePurchaseOrder: varchar("invoice_purchase_order", { length: 64 }),
    taxIdType: varchar("tax_id_type", { length: 32 }),
    taxIdValue: varchar("tax_id_value", { length: 64 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("organization_tenant_slug_unique").on(
      table.tenantId,
      table.slug,
    ),
  ],
);

export const member = pgTable("member", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .default("default")
    .references(() => tenant.id, { onDelete: "restrict" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .default("default")
    .references(() => tenant.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("default")
      .references(() => tenant.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("project_org_slug_unique").on(table.organizationId, table.slug),
  ],
);

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type Organization = typeof organization.$inferSelect;
export type NewOrganization = typeof organization.$inferInsert;
export type Member = typeof member.$inferSelect;
export type NewMember = typeof member.$inferInsert;
export type Invitation = typeof invitation.$inferSelect;
export type NewInvitation = typeof invitation.$inferInsert;
export type Project = typeof project.$inferSelect;
export type NewProject = typeof project.$inferInsert;

// Billing: Pricing tier features (admin-managed feature sets per Stripe product)
export const pricingTierFeatures = pgTable(
  "pricing_tier_features",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(), // Stripe product ID
    featureKey: text("feature_key").notNull(), // e.g., "max_members", "api_access"
    featureValue: text("feature_value").notNull(), // e.g., "5", "true", "unlimited"
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("pricing_tier_feature_unique").on(
      table.productId,
      table.featureKey,
    ),
  ],
);

// Billing: Per-organization feature overrides (not included in tier)
export const orgFeatures = pgTable(
  "org_features",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    featureKey: text("feature_key").notNull(),
    featureValue: text("feature_value").notNull(),
    reason: text("reason"), // e.g., "trial", "promotion", "manual_grant"
    grantedBy: text("granted_by"), // User ID who granted this feature
    expiresAt: timestamp("expires_at"), // Optional expiration
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("org_feature_unique").on(
      table.organizationId,
      table.featureKey,
    ),
  ],
);

// User-level audit log (account-scoped events: session revocation, 2FA toggles, etc.)
export const userAuditLogs = pgTable(
  "user_audit_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    metadata: text("metadata"), // JSON string for additional context
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("user_audit_logs_user_id_idx").on(table.userId)],
);

// Billing: Organization audit logs for billing/subscription changes
export const orgAuditLogs = pgTable("org_audit_logs", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // e.g., "subscription_created", "plan_upgraded"
  fromValue: text("from_value"), // Previous state
  toValue: text("to_value"), // New state
  metadata: text("metadata"), // JSON string for additional context
  performedBy: text("performed_by").notNull(), // User ID or "system"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Billing: Per-organization plan/billing state (admin-managed)
export const orgBilling = pgTable("org_billing", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),

  // Plan state - free-form strings (e.g., "free", "tier1", "tier2", "tier3")
  // Display names are managed via the planTier table.
  planTier: text("plan_tier").notNull().default("free"),
  planStatus: text("plan_status").notNull().default("active"),
  // "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "paused"

  // Stripe linkage (nullable; admin-set tiers may have no subscription)
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeProductId: text("stripe_product_id"),
  stripePriceId: text("stripe_price_id"),

  // Lifecycle
  trialEndsAt: timestamp("trial_ends_at"),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  canceledAt: timestamp("canceled_at"),

  // Admin overrides
  manualOverride: boolean("manual_override").default(false).notNull(),
  notes: text("notes"),
  updatedBy: text("updated_by"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// App settings (for configurable values like enterprise contact link)
export const appSettings = pgTable("app_settings", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Type exports for new tables
export type PricingTierFeature = typeof pricingTierFeatures.$inferSelect;
export type NewPricingTierFeature = typeof pricingTierFeatures.$inferInsert;
export type OrgFeature = typeof orgFeatures.$inferSelect;
export type NewOrgFeature = typeof orgFeatures.$inferInsert;
export type OrgAuditLog = typeof orgAuditLogs.$inferSelect;
export type NewOrgAuditLog = typeof orgAuditLogs.$inferInsert;
export type UserAuditLog = typeof userAuditLogs.$inferSelect;
export type NewUserAuditLog = typeof userAuditLogs.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;
export type OrgBilling = typeof orgBilling.$inferSelect;
export type NewOrgBilling = typeof orgBilling.$inferInsert;

export {
  oauthApplication,
  oauthAccessToken,
  oauthConsent,
  integration,
  integrationInstallation,
  twoFactor,
  passkey,
} from "./schema-ext";
export type {
  OAuthApplication,
  OAuthAccessToken,
  OAuthConsent,
  Integration,
  NewIntegration,
  IntegrationInstallation,
  NewIntegrationInstallation,
  TwoFactor,
  Passkey,
} from "./schema-ext";
