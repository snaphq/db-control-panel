import { Pool, neon, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleServerless } from "drizzle-orm/neon-serverless";
import { WebSocket } from "undici";
import * as schema from "./schema";
import * as schemaAgents from "./schema-agents";
import * as schemaExt from "./schema-ext";
import * as schemaSeo from "./schema-seo";

const mergedSchema = { ...schema, ...schemaAgents, ...schemaExt, ...schemaSeo };

// The HTTP driver is the default because it is safe to reuse in serverless
// handlers. Interactive transactions require a WebSocket-backed Pool; the
// transaction helper below creates and closes one per invocation.
neonConfig.webSocketConstructor = WebSocket;

let db: ReturnType<typeof drizzleHttp>;

function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return url;
}

function getDb() {
  if (!db) {
    db = drizzleHttp(neon(databaseUrl()), { schema: mergedSchema });
  }
  return db;
}

function getTransactionalDb(pool: Pool) {
  return drizzleServerless(pool, { schema: mergedSchema });
}

type TransactionalDb = ReturnType<typeof getTransactionalDb>;
export type DatabaseTransaction = Parameters<
  Parameters<TransactionalDb["transaction"]>[0]
>[0];

/**
 * Run an interactive transaction on a short-lived Neon WebSocket pool.
 *
 * Neon HTTP supports non-interactive `batch` calls but deliberately throws
 * for Drizzle's callback-style transaction API. Keeping this helper scoped to
 * the operation avoids a process-global WebSocket pool that could outlive a
 * serverless request.
 */
export async function withDbTransaction<T>(
  callback: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  const pool = new Pool({
    connectionString: databaseUrl(),
    max: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
  });
  try {
    const transactionalDb = getTransactionalDb(pool);
    return await transactionalDb.transaction(callback);
  } finally {
    await pool.end();
  }
}

// Export a proxy that lazily initializes the database connection
export { getDb as db };
