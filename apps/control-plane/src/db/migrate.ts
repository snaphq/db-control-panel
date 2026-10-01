import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { DatabaseHandle } from './client.js';

/** Advisory-lock key shared by every replica that runs migrations. */
const MIGRATION_LOCK_KEY = 7_358_204_119;

/** `apps/control-plane/drizzle`, which sits two levels above both src/db and dist/db. */
const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../../drizzle', import.meta.url),
);

export interface MigrationLogger {
  info(message: string): void;
}

/**
 * Applies pending Drizzle migrations while holding a session-level advisory
 * lock, so concurrent workers (a rolling update runs two) apply them one at a
 * time. The lock sits on a reserved connection; the migrator uses the pool.
 */
export async function runMigrations(
  handle: DatabaseHandle,
  logger: MigrationLogger = console,
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<void> {
  const lockConnection = await handle.sql.reserve();
  try {
    logger.info('waiting for the migration lock');
    await lockConnection`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
    try {
      await migrate(handle.db, { migrationsFolder });
      logger.info('migrations are up to date');
    } finally {
      await lockConnection`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
    }
  } finally {
    lockConnection.release();
  }
}
