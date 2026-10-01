ALTER TABLE "branch" ADD COLUMN "authenticator_password_enc" text;--> statement-breakpoint
ALTER TABLE "database" ADD COLUMN "data_api_index" integer;--> statement-breakpoint
-- No code wrote libsql_database rows before this migration. The temporary default keeps
-- it applicable if rows were inserted by hand; '' matches no organization.
ALTER TABLE "libsql_database" ADD COLUMN "console_org_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "libsql_database" ALTER COLUMN "console_org_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "neon_project" ADD COLUMN "data_api_jwks" jsonb;--> statement-breakpoint
ALTER TABLE "neon_project" ADD COLUMN "data_api_signing_key_enc" text;--> statement-breakpoint
ALTER TABLE "neon_project" ADD COLUMN "data_api_custom_jwks" jsonb;--> statement-breakpoint
ALTER TABLE "role" ADD COLUMN "password_enc" text;--> statement-breakpoint
CREATE UNIQUE INDEX "database_branch_data_api_index_idx" ON "database" USING btree ("branch_id","data_api_index") WHERE "database"."data_api_index" is not null;--> statement-breakpoint
CREATE INDEX "libsql_database_console_org_id_idx" ON "libsql_database" USING btree ("console_org_id");