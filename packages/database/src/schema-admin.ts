import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Platform operators who sign in to apps/backend. Deliberately separate from
 * the tenant-owned `user` table: backend admins are not tenant users, and the
 * tenant auth provider (Better Auth, Clerk, ...) never sees them.
 */
export const adminUser = pgTable("admin_user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  lastLoginAt: timestamp("last_login_at"),
  disabledAt: timestamp("disabled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const adminSession = pgTable(
  "admin_session",
  {
    id: text("id").primaryKey(),
    adminUserId: text("admin_user_id")
      .notNull()
      .references(() => adminUser.id, { onDelete: "cascade" }),
    // SHA-256 of the cookie token; the raw token is never stored.
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("admin_session_admin_user_id_idx").on(table.adminUserId)],
);

/** One-time email sign-in codes for backend admins. */
export const adminLoginCode = pgTable(
  "admin_login_code",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    // HMAC of the code; the raw code only travels by email.
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("admin_login_code_email_idx").on(table.email)],
);

/** Audit trail for changes made from the backend admin portal. */
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: text("id").primaryKey(),
    adminUserId: text("admin_user_id").references(() => adminUser.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    metadata: text("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("admin_audit_log_admin_user_id_idx").on(table.adminUserId)],
);

export type AdminUser = typeof adminUser.$inferSelect;
export type AdminSession = typeof adminSession.$inferSelect;
