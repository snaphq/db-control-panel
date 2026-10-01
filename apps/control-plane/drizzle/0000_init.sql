CREATE TABLE "branch" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"timeline_id" text NOT NULL,
	"parent_branch_id" text,
	"parent_lsn" text,
	"safekeepers" jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "branch_timeline_id_unique" UNIQUE("timeline_id")
);
--> statement-breakpoint
CREATE TABLE "database" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"name" text NOT NULL,
	"owner_role" text NOT NULL,
	"data_api_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "endpoint" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"type" text DEFAULT 'read_write' NOT NULL,
	"compute_size" text DEFAULT '1' NOT NULL,
	"suspend_timeout_seconds" integer DEFAULT 300 NOT NULL,
	"state" text DEFAULT 'idle' NOT NULL,
	"pod_name" text,
	"pod_ip" text,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "endpoint_type_check" CHECK (type in ('read_write', 'read_only')),
	CONSTRAINT "endpoint_state_check" CHECK (state in ('idle', 'starting', 'running', 'suspending')),
	CONSTRAINT "endpoint_suspend_timeout_check" CHECK (suspend_timeout_seconds >= 0)
);
--> statement-breakpoint
CREATE TABLE "libsql_database" (
	"id" text PRIMARY KEY NOT NULL,
	"console_project_id" text NOT NULL,
	"name" text NOT NULL,
	"namespace" text NOT NULL,
	"node_id" integer NOT NULL,
	"state" text DEFAULT 'creating' NOT NULL,
	"size_limit_bytes" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "neon_project" (
	"id" text PRIMARY KEY NOT NULL,
	"console_project_id" text NOT NULL,
	"console_org_id" text NOT NULL,
	"name" text NOT NULL,
	"tenant_id" text NOT NULL,
	"pg_version" integer DEFAULT 17 NOT NULL,
	"history_retention_seconds" integer DEFAULT 86400 NOT NULL,
	"allowed_ips" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "neon_project_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "node" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tailscale_ip" text NOT NULL,
	"zone" text NOT NULL,
	"roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"capacity" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"registered_pageserver" boolean DEFAULT false NOT NULL,
	"registered_safekeepers" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operation" (
	"id" text PRIMARY KEY NOT NULL,
	"console_project_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"action" text NOT NULL,
	"status" text DEFAULT 'scheduling' NOT NULL,
	"failures_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"progress" jsonb DEFAULT '{"completedSteps":[],"outputs":{}}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "operation_action_check" CHECK (action in ('project.create', 'project.delete', 'branch.create', 'branch.delete', 'endpoint.start', 'endpoint.suspend', 'endpoint.update', 'role.reset_password', 'database.create', 'database.delete', 'data_api.enable', 'data_api.disable', 'libsql.create', 'libsql.delete', 'libsql.fork')),
	CONSTRAINT "operation_status_check" CHECK (status in ('scheduling', 'running', 'finished', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"name" text NOT NULL,
	"scram_secret" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_event" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"kind" text NOT NULL,
	"value" bigint NOT NULL,
	"idempotency_key" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_event_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "branch" ADD CONSTRAINT "branch_project_id_neon_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."neon_project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch" ADD CONSTRAINT "branch_parent_branch_id_branch_id_fk" FOREIGN KEY ("parent_branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database" ADD CONSTRAINT "database_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endpoint" ADD CONSTRAINT "endpoint_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "libsql_database" ADD CONSTRAINT "libsql_database_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "branch_project_name_live_idx" ON "branch" USING btree ("project_id","name") WHERE "branch"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "branch_project_default_live_idx" ON "branch" USING btree ("project_id") WHERE "branch"."is_default" and "branch"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "branch_parent_branch_id_idx" ON "branch" USING btree ("parent_branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "database_branch_name_idx" ON "database" USING btree ("branch_id","name");--> statement-breakpoint
CREATE INDEX "endpoint_branch_id_idx" ON "endpoint" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "endpoint_state_idx" ON "endpoint" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "libsql_database_namespace_live_idx" ON "libsql_database" USING btree ("namespace") WHERE "libsql_database"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "libsql_database_console_project_id_idx" ON "libsql_database" USING btree ("console_project_id");--> statement-breakpoint
CREATE INDEX "libsql_database_node_id_idx" ON "libsql_database" USING btree ("node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "neon_project_console_project_id_live_idx" ON "neon_project" USING btree ("console_project_id") WHERE "neon_project"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "neon_project_console_org_id_idx" ON "neon_project" USING btree ("console_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "operation_active_per_project_idx" ON "operation" USING btree ("console_project_id") WHERE "operation"."status" in ('scheduling', 'running');--> statement-breakpoint
CREATE INDEX "operation_target_idx" ON "operation" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_branch_name_idx" ON "role" USING btree ("branch_id","name");--> statement-breakpoint
CREATE INDEX "usage_event_project_kind_idx" ON "usage_event" USING btree ("project_id","kind");