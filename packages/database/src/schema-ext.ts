import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { organization, project, tenant, user } from "./schema";

// ============================================================================
// OIDC Provider (Better Auth oidcProvider plugin)
// ============================================================================

export const oauthApplication = pgTable("oauth_application", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .default("default")
    .references(() => tenant.id, { onDelete: "cascade" }),
  name: text("name"),
  icon: text("icon"),
  metadata: text("metadata"),
  clientId: text("client_id").unique(),
  clientSecret: text("client_secret"),
  // Better Auth calls this field `redirectUrls`; retain the existing column
  // name so the adapter and the deployed database agree.
  redirectUrls: text("redirect_u_r_ls"),
  type: text("type"),
  /** Better Auth OIDC token endpoint authentication method. */
  authenticationScheme: text("authentication_scheme"),
  disabled: boolean("disabled"),
  userId: text("user_id"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const oauthAccessToken = pgTable("oauth_access_token", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .default("default")
    .references(() => tenant.id, { onDelete: "cascade" }),
  accessToken: text("access_token").unique(),
  refreshToken: text("refresh_token").unique(),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  clientId: text("client_id"),
  userId: text("user_id"),
  scopes: text("scopes"),
  /** Canonical protected resource this token was minted for. */
  resource: text("resource"),
  /** RFC 7009 revocation marker; null means the token is active. */
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const oauthConsent = pgTable("oauth_consent", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .default("default")
    .references(() => tenant.id, { onDelete: "cascade" }),
  clientId: text("client_id"),
  userId: text("user_id"),
  scopes: text("scopes"),
  /** Exact MCP resource for which consent was recorded. */
  resource: text("resource"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
  consentGiven: boolean("consent_given"),
});

export type OAuthApplication = typeof oauthApplication.$inferSelect;
export type OAuthAccessToken = typeof oauthAccessToken.$inferSelect;
export type OAuthConsent = typeof oauthConsent.$inferSelect;

// ============================================================================
// Integrations (registry + installations)
// ============================================================================

export const integration = pgTable("integration", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  iconUrl: text("icon_url"),
  docsUrl: text("docs_url"),
  status: text("status").notNull().default("active"),
  isSystemManaged: boolean("is_system_managed").default(false).notNull(),
  configSchema: jsonb("config_schema"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const integrationInstallation = pgTable(
  "integration_installation",
  {
    id: text("id").primaryKey(),
    integrationId: text("integration_id")
      .notNull()
      .references(() => integration.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => project.id, {
      onDelete: "cascade",
    }),
    displayName: text("display_name"),
    configEncrypted: text("config_encrypted"),
    configPublic: jsonb("config_public"),
    status: text("status").notNull().default("active"),
    lastVerifiedAt: timestamp("last_verified_at"),
    lastError: text("last_error"),
    isSystemManaged: boolean("is_system_managed").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("integration_installation_unique")
      .on(
        table.organizationId,
        table.projectId,
        table.integrationId,
        table.displayName,
      )
      .nullsNotDistinct(),
    index("integration_installation_org_idx").on(table.organizationId),
    index("integration_installation_project_idx").on(table.projectId),
  ],
);

export type Integration = typeof integration.$inferSelect;
export type NewIntegration = typeof integration.$inferInsert;
export type IntegrationInstallation =
  typeof integrationInstallation.$inferSelect;
export type NewIntegrationInstallation =
  typeof integrationInstallation.$inferInsert;

// BetterAuth two-factor plugin
export const twoFactor = pgTable("two_factor", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .default("default")
    .references(() => tenant.id, { onDelete: "cascade" }),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

// BetterAuth passkey plugin
export const passkey = pgTable("passkey", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .default("default")
    .references(() => tenant.id, { onDelete: "cascade" }),
  name: text("name"),
  publicKey: text("public_key").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  credentialID: text("credential_id").notNull(),
  counter: integer("counter").notNull(),
  deviceType: text("device_type").notNull(),
  backedUp: boolean("backed_up").notNull(),
  transports: text("transports"),
  createdAt: timestamp("created_at").defaultNow(),
  aaguid: text("aaguid"),
});

export type TwoFactor = typeof twoFactor.$inferSelect;
export type Passkey = typeof passkey.$inferSelect;
