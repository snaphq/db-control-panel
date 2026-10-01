import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import {
  ACTIVE_OPERATION_STATUSES,
  type OperationProgress,
  operation,
} from '../db/schema.js';

export type OperationRecord = typeof operation.$inferSelect;

/**
 * Persistence the runner needs. The Drizzle implementation is below; tests use
 * an in-memory one, which keeps the runner's retry logic unit-testable.
 */
export interface OperationStore {
  load(id: string): Promise<OperationRecord | null>;
  /** Moves `scheduling` to `running`. Returns null if the operation is already settled. */
  markRunning(id: string): Promise<OperationRecord | null>;
  saveProgress(id: string, progress: OperationProgress): Promise<void>;
  markFinished(id: string): Promise<void>;
  /** Counts a failed attempt; `terminal` also moves the operation to `failed`. */
  recordFailure(id: string, message: string, terminal: boolean): Promise<void>;
}

export function createOperationStore(db: Database): OperationStore {
  return {
    async load(id) {
      const [row] = await db
        .select()
        .from(operation)
        .where(eq(operation.id, id));
      return row ?? null;
    },

    async markRunning(id) {
      const [row] = await db
        .update(operation)
        .set({ status: 'running', updatedAt: sql`now()` })
        .where(
          and(
            eq(operation.id, id),
            inArray(operation.status, [...ACTIVE_OPERATION_STATUSES]),
          ),
        )
        .returning();
      return row ?? null;
    },

    async saveProgress(id, progress) {
      await db
        .update(operation)
        .set({ progress, updatedAt: sql`now()` })
        .where(eq(operation.id, id));
    },

    async markFinished(id) {
      await db
        .update(operation)
        .set({
          status: 'finished',
          error: null,
          updatedAt: sql`now()`,
          finishedAt: sql`now()`,
        })
        .where(eq(operation.id, id));
    },

    async recordFailure(id, message, terminal) {
      await db
        .update(operation)
        .set({
          failuresCount: sql`${operation.failuresCount} + 1`,
          error: message,
          updatedAt: sql`now()`,
          ...(terminal ? { status: 'failed', finishedAt: sql`now()` } : {}),
        })
        .where(eq(operation.id, id));
    },
  };
}
