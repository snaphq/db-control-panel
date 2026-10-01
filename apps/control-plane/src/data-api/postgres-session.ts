import postgres from 'postgres';
import type { SqlConnector } from './bootstrap.js';

const CONNECT_TIMEOUT_SECONDS = 15;

/**
 * Opens one connection to a compute with the `postgres` driver. The compute has
 * no TLS of its own (the Neon proxy also talks to it in clear text inside the
 * cluster), so TLS is off.
 */
export const connectPostgres: SqlConnector = async (target) => {
  const sql = postgres({
    host: target.host,
    port: target.port,
    database: target.database,
    username: target.user,
    password: target.password,
    ssl: false,
    max: 1,
    connect_timeout: CONNECT_TIMEOUT_SECONDS,
    idle_timeout: 5,
    onnotice: () => {},
    connection: { application_name: 'alloydb-control-plane' },
  });
  try {
    await sql`select 1`;
  } catch (error) {
    await sql.end({ timeout: 1 }).catch(() => undefined);
    throw error;
  }
  return {
    async run(statement) {
      await sql.unsafe(statement);
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
};
