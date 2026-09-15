-- Agent-readiness security migration
--
-- This file is intentionally tracked under migrations-manual because
-- packages/database/drizzle is a local Drizzle output directory. Review and
-- apply it through the normal database deployment process; the application
-- never runs this file implicitly.

-- Account API tokens must carry the tenant of the user they authenticate.
ALTER TABLE "account_api_token"
  ADD COLUMN IF NOT EXISTS "tenant_id" text DEFAULT 'default' NOT NULL;

UPDATE "account_api_token" AS token
SET "tenant_id" = account_user."tenant_id"
FROM "user" AS account_user
WHERE token."user_id" = account_user."id"
  AND token."tenant_id" IS DISTINCT FROM account_user."tenant_id";

DO $$
BEGIN
  ALTER TABLE "account_api_token"
    ADD CONSTRAINT "account_api_token_tenant_id_tenant_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "account_api_token_tenant_idx"
  ON "account_api_token" ("tenant_id");

-- OIDC access tokens are opaque. These columns bind them to the MCP resource
-- and provide revocation/refresh-token rotation state.
ALTER TABLE "oauth_access_token"
  ADD COLUMN IF NOT EXISTS "resource" text;
ALTER TABLE "oauth_access_token"
  ADD COLUMN IF NOT EXISTS "revoked_at" timestamp;

ALTER TABLE "oauth_consent"
  ADD COLUMN IF NOT EXISTS "resource" text;

-- Recent Better Auth OIDC releases persist this client-authentication method
-- during dynamic registration. Older snapshots omitted the column, which
-- makes the adapter reject every registration because it validates the
-- supplied model fields against the Drizzle schema.
ALTER TABLE "oauth_application"
  ADD COLUMN IF NOT EXISTS "authentication_scheme" text;

CREATE INDEX IF NOT EXISTS "oauth_access_token_resource_idx"
  ON "oauth_access_token" ("tenant_id", "resource");

CREATE INDEX IF NOT EXISTS "oauth_consent_resource_idx"
  ON "oauth_consent" ("tenant_id", "resource");

-- Agent JWTs issued before resource binding cannot be safely replayed against
-- a particular host, so quarantine them and require a fresh exchange.
ALTER TABLE "agent_token"
  ADD COLUMN IF NOT EXISTS "resource" text DEFAULT '' NOT NULL;
ALTER TABLE "agent_token"
  ADD COLUMN IF NOT EXISTS "revoked_at" timestamp;

UPDATE "agent_token"
SET "revoked_at" = COALESCE("revoked_at", now())
WHERE "resource" = '';

CREATE INDEX IF NOT EXISTS "agent_token_resource_idx"
  ON "agent_token" ("tenant_id", "resource");

-- A registration may have only one live user-code ceremony. Quarantine any
-- legacy duplicates before adding the invariant for new writes.
WITH ranked_live_attempts AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "registration_id"
      ORDER BY "created_at" DESC, "id" DESC
    ) AS "rank"
  FROM "agent_claim_attempt"
  WHERE "status" = 'initiated'
)
UPDATE "agent_claim_attempt" AS attempt
SET "status" = 'expired'
FROM ranked_live_attempts AS ranked
WHERE attempt."id" = ranked."id"
  AND ranked."rank" > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "agent_claim_attempt_live_unique"
  ON "agent_claim_attempt" ("registration_id")
  WHERE "status" = 'initiated';
