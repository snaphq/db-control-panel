import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { tenant, user } from "./schema";

// ============================================================================
// Operators
// ============================================================================

// Operators are named machine identities owned by a user. Programmatic
// requests (MCP, future public APIs) authenticate with an operator token and
// are attributed to the operator, not just the owning user. Operator scope is
// JSON: { mode: "all_owned" } or { mode: "organizations", organizationIds }.
export const operator = pgTable(
  "operator",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("default")
      .references(() => tenant.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // "active" | "suspended"; terminal revocation uses revokedAt.
    status: text("status").notNull().default("active"),
    scope: jsonb("scope").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    index("operator_tenant_user_idx").on(table.tenantId, table.userId),
  ],
);

// Operator tokens are the bearer credentials for an operator. Only the
// SHA-256 hash of the plaintext (opt_<random>) is persisted.
export const operatorToken = pgTable(
  "operator_token",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("default")
      .references(() => tenant.id, { onDelete: "cascade" }),
    operatorId: text("operator_id")
      .notNull()
      .references(() => operator.id, { onDelete: "cascade" }),
    // Optional credential label, e.g. "laptop", "CI".
    label: text("label"),
    // sha256 hex of the full plaintext token (opt_<random>)
    tokenHash: text("token_hash").notNull().unique(),
    // First chars of the plaintext for display (e.g., "opt_abcd1234")
    tokenPrefix: text("token_prefix").notNull(),
    expiresAt: timestamp("expires_at"),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    index("operator_token_operator_idx").on(table.operatorId),
    index("operator_token_tenant_idx").on(table.tenantId),
  ],
);

// Fallback sink for operator activity when Axiom is not configured. The
// primary sink is the axiom.co dataset (see @repo/mcp-chatgpt logger).
export const operatorActivity = pgTable(
  "operator_activity",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("default")
      .references(() => tenant.id, { onDelete: "cascade" }),
    operatorId: text("operator_id").references(() => operator.id, {
      onDelete: "set null",
    }),
    credentialId: text("credential_id").references(() => operatorToken.id, {
      onDelete: "set null",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    requestId: text("request_id"),
    // mcp_request | mcp_response | mcp_tool_call | mcp_tool_response | mcp_error
    eventType: text("event_type").notNull(),
    authMethod: text("auth_method"),
    toolName: text("tool_name"),
    method: text("method"),
    path: text("path"),
    statusCode: integer("status_code"),
    durationMs: integer("duration_ms"),
    success: boolean("success"),
    error: text("error"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("operator_activity_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
    index("operator_activity_operator_created_idx").on(
      table.operatorId,
      table.createdAt,
    ),
  ],
);

export type Operator = typeof operator.$inferSelect;
export type NewOperator = typeof operator.$inferInsert;
export type OperatorToken = typeof operatorToken.$inferSelect;
export type NewOperatorToken = typeof operatorToken.$inferInsert;
export type OperatorActivity = typeof operatorActivity.$inferSelect;
export type NewOperatorActivity = typeof operatorActivity.$inferInsert;
