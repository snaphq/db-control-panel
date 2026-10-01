import { type PostgresJsDatabase, drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type Database = PostgresJsDatabase<typeof schema>;
export type Sql = postgres.Sql;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface DatabaseHandle {
  db: Database;
  sql: Sql;
  /** Waits for in-flight queries, then closes every pooled connection. */
  close(): Promise<void>;
}

const DEFAULT_POOL_SIZE = 10;
const CLOSE_TIMEOUT_SECONDS = 10;

export function createDatabase(
  connectionString: string,
  options: { max?: number; applicationName?: string } = {},
): DatabaseHandle {
  const sql = postgres(connectionString, {
    max: options.max ?? DEFAULT_POOL_SIZE,
    connection: {
      application_name: options.applicationName ?? 'control-plane',
    },
    onnotice: () => {},
  });
  return {
    db: drizzle(sql, { schema }),
    sql,
    close: () => sql.end({ timeout: CLOSE_TIMEOUT_SECONDS }),
  };
}

/** Readiness probe: a cheap round trip that proves the pool can reach Postgres. */
export async function pingDatabase(sql: Sql): Promise<void> {
  await sql`select 1`;
}
