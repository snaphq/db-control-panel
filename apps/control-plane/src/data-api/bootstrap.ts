/**
 * SQL that makes a database ready for PostgREST, run as the database's owner
 * role over the pod IP after the compute reports `running`.
 *
 * Why SQL and not the compute spec: compute_ctl creates every spec role with
 * `CREATEROLE CREATEDB BYPASSRLS REPLICATION IN ROLE neon_superuser`
 * (compute_tools/src/spec_apply.rs:819-826) and has no way to ask for
 * NOLOGIN or NOBYPASSRLS. A spec role would skip row-level security, which is
 * the whole point of the `anonymous` and `authenticated` roles. A role created
 * with plain `CREATE ROLE` by the owner (who has CREATEROLE) has none of those
 * attributes. Roles that are not in the spec are left alone by later spec
 * applies, and the Neon proxy only admits roles whose SCRAM secret the control
 * plane serves, so `authenticator` can log in only from inside the pod.
 *
 * Every statement is safe to repeat. The role names are fixed; the only value
 * that varies is the `authenticator` password, passed as a SCRAM secret so the
 * plaintext never appears in a statement the server could log.
 */

export interface SqlTarget {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface SqlSession {
  run(statement: string): Promise<void>;
  close(): Promise<void>;
}

export type SqlConnector = (target: SqlTarget) => Promise<SqlSession>;

/** `'...'` with embedded quotes doubled; the server runs with standard_conforming_strings on. */
export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const SCHEMA = 'alloydb_data_api';

/** Creates a role unless it exists, for roles without a password. */
const createRoleIfMissing = (name: string): string => `
DO $alloydb$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${quoteLiteral(name)}) THEN
    CREATE ROLE ${name} NOLOGIN;
  END IF;
END
$alloydb$`;

/** The role is cluster-wide: a second database's owner may lack ADMIN on it, so only add the membership when it is missing. */
const grantMembershipIfMissing = (role: string, member: string): string => `
DO $alloydb$
BEGIN
  IF NOT pg_has_role(${quoteLiteral(member)}, ${quoteLiteral(role)}, 'MEMBER') THEN
    GRANT ${role} TO ${member};
  END IF;
END
$alloydb$`;

const DDL_WATCH_FUNCTION = `
CREATE OR REPLACE FUNCTION ${SCHEMA}.pgrst_ddl_watch() RETURNS event_trigger AS $alloydb$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA',
      'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE',
      'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE',
      'CREATE VIEW', 'ALTER VIEW',
      'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW',
      'CREATE FUNCTION', 'ALTER FUNCTION',
      'CREATE TRIGGER', 'CREATE TYPE', 'ALTER TYPE',
      'CREATE RULE', 'COMMENT'
    ) AND cmd.schema_name IS DISTINCT FROM 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END;
$alloydb$ LANGUAGE plpgsql`;

const DROP_WATCH_FUNCTION = `
CREATE OR REPLACE FUNCTION ${SCHEMA}.pgrst_drop_watch() RETURNS event_trigger AS $alloydb$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema', 'table', 'foreign table', 'view', 'materialized view',
      'function', 'trigger', 'type', 'rule'
    ) AND obj.is_temporary IS false
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END;
$alloydb$ LANGUAGE plpgsql`;

const eventTrigger = (name: string, event: string, fn: string): string => `
DO $alloydb$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = ${quoteLiteral(name)}) THEN
    CREATE EVENT TRIGGER ${name} ON ${event} EXECUTE FUNCTION ${SCHEMA}.${fn}();
  END IF;
END
$alloydb$`;

export interface BootstrapStatement {
  name: string;
  sql: string;
  /** A failure with SQLSTATE 42501 only means the owner may not create event triggers. */
  needsEventTriggerPrivilege?: boolean;
}

/** Roles, grants, default privileges, then the optional schema-reload triggers. */
export function bootstrapStatements(input: {
  authenticatorScramSecret: string;
}): BootstrapStatement[] {
  const secret = quoteLiteral(input.authenticatorScramSecret);
  const statements: BootstrapStatement[] = [
    {
      name: 'authenticator role',
      sql: `
DO $alloydb$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD ${secret};
  ELSE
    -- Brings a drifted password back; skipped when this owner did not create the role.
    BEGIN
      ALTER ROLE authenticator PASSWORD ${secret};
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END IF;
END
$alloydb$`,
    },
    { name: 'anonymous role', sql: createRoleIfMissing('anonymous') },
    { name: 'authenticated role', sql: createRoleIfMissing('authenticated') },
    {
      name: 'anonymous membership',
      sql: grantMembershipIfMissing('anonymous', 'authenticator'),
    },
    {
      name: 'authenticated membership',
      sql: grantMembershipIfMissing('authenticated', 'authenticator'),
    },
    {
      name: 'schema usage',
      sql: 'GRANT USAGE ON SCHEMA public TO anonymous, authenticated',
    },
    // GRANT ALL ON ALL ... only warns for objects the owner cannot grant on.
    {
      name: 'privileges on existing objects',
      sql: 'GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated',
    },
    {
      name: 'privileges on existing sequences',
      sql: 'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated',
    },
    {
      name: 'privileges on existing routines',
      sql: 'GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated',
    },
    {
      name: 'default privileges on tables',
      sql: 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated',
    },
    {
      name: 'default privileges on sequences',
      sql: 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated',
    },
    {
      name: 'default privileges on routines',
      sql: 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated',
    },
    { name: 'reload schema', sql: `CREATE SCHEMA IF NOT EXISTS ${SCHEMA}` },
    {
      name: 'reload schema usage',
      sql: `GRANT USAGE ON SCHEMA ${SCHEMA} TO PUBLIC`,
    },
    { name: 'ddl watch function', sql: DDL_WATCH_FUNCTION },
    { name: 'drop watch function', sql: DROP_WATCH_FUNCTION },
    {
      name: 'ddl watch trigger',
      sql: eventTrigger(
        'pgrst_ddl_watch',
        'ddl_command_end',
        'pgrst_ddl_watch',
      ),
      needsEventTriggerPrivilege: true,
    },
    {
      name: 'drop watch trigger',
      sql: eventTrigger('pgrst_drop_watch', 'sql_drop', 'pgrst_drop_watch'),
      needsEventTriggerPrivilege: true,
    },
    { name: 'reload now', sql: "NOTIFY pgrst, 'reload schema'" },
  ];
  return statements;
}

const INSUFFICIENT_PRIVILEGE = '42501';

export class BootstrapError extends Error {
  constructor(
    readonly statement: string,
    cause: unknown,
    /** SQLSTATE when the server reported one. */
    readonly code: string | undefined,
  ) {
    super(
      `Data API bootstrap failed at "${statement}": ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = 'BootstrapError';
    this.cause = cause;
  }
}

export type SchemaReload = 'event-trigger' | 'manual';

/**
 * Runs the bootstrap. Returns `event-trigger` when PostgREST reloads its schema
 * cache on every DDL change, or `manual` when the owner may not create event
 * triggers (stock PostgreSQL requires a superuser) and `NOTIFY pgrst, 'reload
 * schema'` must be sent after schema changes.
 */
export async function bootstrapDataApi(
  session: SqlSession,
  input: { authenticatorScramSecret: string },
): Promise<{ schemaReload: SchemaReload }> {
  let schemaReload: SchemaReload = 'event-trigger';
  for (const statement of bootstrapStatements(input)) {
    try {
      await session.run(statement.sql);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (
        statement.needsEventTriggerPrivilege &&
        code === INSUFFICIENT_PRIVILEGE
      ) {
        schemaReload = 'manual';
        continue;
      }
      throw new BootstrapError(statement.name, error, code);
    }
  }
  return { schemaReload };
}
