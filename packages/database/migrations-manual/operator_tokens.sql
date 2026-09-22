-- Operator tokens migration (hard cutover from account_api_token)
--
-- This file is intentionally tracked under migrations-manual because
-- packages/database/drizzle is a local Drizzle output directory. Review and
-- apply it through the normal database deployment process; the application
-- never runs this file implicitly. Apply it BEFORE deploying the application
-- release that reads these tables: the app no longer references
-- account_api_token, so existing cet_ credentials stop authenticating.
--
-- Rollback note: the legacy table is renamed (not dropped) to
-- account_api_token_archive. To roll back an application release, rename it
-- back to account_api_token after removing the new tables.

CREATE TABLE IF NOT EXISTS "operator" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text DEFAULT 'default' NOT NULL
    REFERENCES "tenant"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'active' NOT NULL,
  "scope" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "revoked_at" timestamp
);

CREATE INDEX IF NOT EXISTS "operator_tenant_user_idx"
  ON "operator" ("tenant_id", "user_id");

CREATE TABLE IF NOT EXISTS "operator_token" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text DEFAULT 'default' NOT NULL
    REFERENCES "tenant"("id") ON DELETE CASCADE,
  "operator_id" text NOT NULL
    REFERENCES "operator"("id") ON DELETE CASCADE,
  "label" text,
  "token_hash" text NOT NULL UNIQUE,
  "token_prefix" text NOT NULL,
  "expires_at" timestamp,
  "last_used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "revoked_at" timestamp
);

CREATE INDEX IF NOT EXISTS "operator_token_operator_idx"
  ON "operator_token" ("operator_id");

CREATE INDEX IF NOT EXISTS "operator_token_tenant_idx"
  ON "operator_token" ("tenant_id");

-- Fallback sink for operator activity when Axiom is not configured.
CREATE TABLE IF NOT EXISTS "operator_activity" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text DEFAULT 'default' NOT NULL
    REFERENCES "tenant"("id") ON DELETE CASCADE,
  "operator_id" text REFERENCES "operator"("id") ON DELETE SET NULL,
  "credential_id" text REFERENCES "operator_token"("id") ON DELETE SET NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "request_id" text,
  "event_type" text NOT NULL,
  "auth_method" text,
  "tool_name" text,
  "method" text,
  "path" text,
  "status_code" integer,
  "duration_ms" integer,
  "success" boolean,
  "error" text,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "operator_activity_tenant_created_idx"
  ON "operator_activity" ("tenant_id", "created_at");

CREATE INDEX IF NOT EXISTS "operator_activity_operator_created_idx"
  ON "operator_activity" ("operator_id", "created_at");

-- Hard cutover: preserve the credential metadata (never plaintext), then
-- remove the live table. Idempotent on re-run.
DO $$
BEGIN
  IF to_regclass('public.account_api_token') IS NOT NULL THEN
    ALTER TABLE "account_api_token" RENAME TO "account_api_token_archive";
  END IF;
END $$;
