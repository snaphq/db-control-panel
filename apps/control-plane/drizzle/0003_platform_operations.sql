CREATE TABLE "safekeeper" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "safekeeper_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"node_id" integer NOT NULL,
	"node_name" text NOT NULL,
	"state" text DEFAULT 'creating' NOT NULL,
	"operation_id" text,
	"drain" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "safekeeper_state_check" CHECK (state in ('creating', 'active', 'retiring', 'retired'))
);
--> statement-breakpoint
ALTER TABLE "operation" DROP CONSTRAINT "operation_action_check";--> statement-breakpoint
CREATE INDEX "safekeeper_state_idx" ON "safekeeper" USING btree ("state");--> statement-breakpoint
ALTER TABLE "operation" ADD CONSTRAINT "operation_action_check" CHECK (action in ('project.create', 'project.delete', 'branch.create', 'branch.delete', 'endpoint.start', 'endpoint.suspend', 'endpoint.update', 'role.reset_password', 'database.create', 'database.delete', 'data_api.enable', 'data_api.disable', 'libsql.create', 'libsql.delete', 'libsql.fork', 'pageservers.rebalance', 'safekeepers.spread'));