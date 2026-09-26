import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./schema";
import { tenant } from "./schema-tenant";

// Agent providers trusted to mint ID-JAG identity assertions (trust list)
export const agentProvider = pgTable(
  "agent_provider",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("default")
      .references(() => tenant.id, { onDelete: "cascade" }),
    issuer: text("issuer").notNull(), // provider issuer URL, e.g. https://auth.openai.com
    displayName: text("display_name").notNull(), // service-controlled copy for the claim page
    jwksUri: text("jwks_uri"), // defaults to {issuer}/.well-known/jwks.json when null
    cimdUrl: text("cimd_url"), // optional client-id metadata document URL
    attestationPolicy: text("attestation_policy"), // e.g. "requires mfa in amr"
    status: text("status").notNull().default("active"), // active | disabled
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("agent_provider_issuer_unique").on(table.tenantId, table.issuer),
  ],
);

// Agent registrations created at POST /agent/identity
export const agentRegistration = pgTable(
  "agent_registration",
  {
    id: text("id").primaryKey(), // reg_...
    tenantId: text("tenant_id")
      .notNull()
      .default("default")
      .references(() => tenant.id, { onDelete: "cascade" }),
    // anonymous | service_auth | identity_assertion
    type: text("type").notNull(),
    // unclaimed | claimed | expired | revoked
    status: text("status").notNull().default("unclaimed"),
    // Principal binding once claimed (or resolved via ID-JAG)
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    // service_auth: asserted email stored plainly for claim-page binding
    claimEmail: text("claim_email"),
    // sha256 of the claim_token handed to the agent (plaintext returned once)
    claimTokenHash: text("claim_token_hash"),
    claimTokenExpiresAt: timestamp("claim_token_expires_at"),
    // outer claim window (24h default); null = no claim window (already claimed)
    claimExpiresAt: timestamp("claim_expires_at"),
    // registration TTL; unclaimed rows past this are lazily expired
    registrationExpiresAt: timestamp("registration_expires_at"),
    // ID-JAG delegation identity (issuer sub pair) for identity_assertion type
    issuer: text("issuer"),
    subject: text("subject"),
    providerId: text("provider_id").references(() => agentProvider.id, {
      onDelete: "set null",
    }),
    firstLinkedAt: timestamp("first_linked_at"),
    // granted scope sets as space-separated strings
    scopes: text("scopes").notNull().default("api.read"),
    preClaimScopes: text("pre_claim_scopes").notNull().default("api.read"),
    postClaimScopes: text("post_claim_scopes")
      .notNull()
      .default("api.read api.write"),
    assertionExpiresAt: timestamp("assertion_expires_at"),
    lastTokenIssuedAt: timestamp("last_token_issued_at"),
    lastPollAt: timestamp("last_poll_at"),
    createdByAgent: boolean("created_by_agent").notNull().default(true),
    // audit trail
    registrationIp: text("registration_ip"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("agent_registration_claim_token_unique").on(table.claimTokenHash),
    unique("agent_registration_delegation_unique").on(
      table.tenantId,
      table.issuer,
      table.subject,
    ),
    index("agent_registration_status_idx").on(table.status),
    index("agent_registration_tenant_status_idx").on(
      table.tenantId,
      table.status,
    ),
    index("agent_registration_user_idx").on(table.userId),
    index("agent_registration_expires_idx").on(table.registrationExpiresAt),
  ],
);

// RFC 8628-shaped claim attempts (user_code ceremonies) per registration
export const agentClaimAttempt = pgTable(
  "agent_claim_attempt",
  {
    id: text("id").primaryKey(), // cla_...
    tenantId: text("tenant_id")
      .notNull()
      .default("default")
      .references(() => tenant.id, { onDelete: "cascade" }),
    registrationId: text("registration_id")
      .notNull()
      .references(() => agentRegistration.id, { onDelete: "cascade" }),
    // sha256 of claim_attempt_token embedded in verification_uri
    attemptTokenHash: text("attempt_token_hash").notNull(),
    // sha256 of the 6-digit user_code surfaced to the user
    userCodeHash: text("user_code_hash").notNull(),
    // initiated | completed | expired
    status: text("status").notNull().default("initiated"),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    expiresAt: timestamp("expires_at").notNull(), // user_code window (10 min)
    completedByUserId: text("completed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    completedAt: timestamp("completed_at"),
    completedIp: text("completed_ip"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("agent_claim_attempt_token_unique").on(table.attemptTokenHash),
    index("agent_claim_attempt_registration_idx").on(table.registrationId),
    // A registration may have only one live user-code ceremony.
    uniqueIndex("agent_claim_attempt_live_unique")
      .on(table.registrationId)
      .where(sql`${table.status} = 'initiated'`),
  ],
);

// Ledger of issued access tokens (stateless JWTs; rows track revocation)
export const agentToken = pgTable(
  "agent_token",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("default")
      .references(() => tenant.id, { onDelete: "cascade" }),
    registrationId: text("registration_id")
      .notNull()
      .references(() => agentRegistration.id, { onDelete: "cascade" }),
    jti: text("jti").notNull(),
    scope: text("scope").notNull(),
    /** Exact MCP resource audience bound at issuance. */
    resource: text("resource").notNull().default(""),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("agent_token_jti_unique").on(table.jti),
    index("agent_token_registration_idx").on(table.registrationId),
    index("agent_token_expires_idx").on(table.expiresAt),
    index("agent_token_resource_idx").on(table.tenantId, table.resource),
  ],
);

// Replay cache for provider ID-JAG jti values (Phase 3)
export const agentJtiSeen = pgTable("agent_jti_seen", {
  jti: text("jti").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Stable (iss, sub, aud) -> user binding established via ID-JAG or claim
export const agentDelegation = pgTable(
  "agent_delegation",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("default")
      .references(() => tenant.id, { onDelete: "cascade" }),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    audience: text("audience").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    registrationId: text("registration_id").references(
      () => agentRegistration.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("agent_delegation_triple_unique").on(
      table.tenantId,
      table.issuer,
      table.subject,
      table.audience,
    ),
    index("agent_delegation_user_idx").on(table.userId),
  ],
);

// Audit events for every state change in the agent-auth flows
export const agentAuthAudit = pgTable(
  "agent_auth_audit",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("default")
      .references(() => tenant.id, { onDelete: "cascade" }),
    registrationId: text("registration_id").references(
      () => agentRegistration.id,
      { onDelete: "cascade" },
    ),
    // registration.created | assertion.issued | token.issued | token.revoked
    // | claim.requested | user_code.minted | claim.confirmed
    // | registration.expired | registration.revoked
    event: text("event").notNull(),
    email: text("email"),
    issuer: text("issuer"),
    subject: text("subject"),
    metadata: jsonb("metadata"),
    ip: text("ip"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("agent_auth_audit_registration_idx").on(table.registrationId),
    index("agent_auth_audit_event_idx").on(table.event),
    index("agent_auth_audit_created_idx").on(table.createdAt),
  ],
);

export type AgentProvider = typeof agentProvider.$inferSelect;
export type NewAgentProvider = typeof agentProvider.$inferInsert;
export type AgentRegistration = typeof agentRegistration.$inferSelect;
export type NewAgentRegistration = typeof agentRegistration.$inferInsert;
export type AgentClaimAttempt = typeof agentClaimAttempt.$inferSelect;
export type NewAgentClaimAttempt = typeof agentClaimAttempt.$inferInsert;
export type AgentToken = typeof agentToken.$inferSelect;
export type NewAgentToken = typeof agentToken.$inferInsert;
export type AgentDelegation = typeof agentDelegation.$inferSelect;
export type NewAgentDelegation = typeof agentDelegation.$inferInsert;
export type AgentAuthAudit = typeof agentAuthAudit.$inferSelect;
export type NewAgentAuthAudit = typeof agentAuthAudit.$inferInsert;
