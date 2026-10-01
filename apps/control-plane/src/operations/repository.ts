import { and, eq, inArray } from 'drizzle-orm';
import { newId } from '../crypto/ids.js';
import type { Database, Transaction } from '../db/client.js';
import {
  ACTIVE_OPERATION_STATUSES,
  type OperationAction,
  operation,
} from '../db/schema.js';
import { isUniqueViolation } from './idempotency.js';
import type { OperationQueue } from './queue.js';
import type { OperationRecord } from './store.js';

/** The project already has an operation in `scheduling` or `running`; HTTP 423. */
export class ProjectBusyError extends Error {
  readonly status = 423;

  constructor(
    readonly consoleProjectId: string,
    readonly activeOperationId?: string,
  ) {
    super(
      `Project ${consoleProjectId} has an active operation${
        activeOperationId ? ` (${activeOperationId})` : ''
      }; retry when it finishes`,
    );
    this.name = 'ProjectBusyError';
  }
}

export interface CreateOperationInput {
  consoleProjectId: string;
  targetType: string;
  targetId: string;
  action: OperationAction;
  params?: Record<string, unknown>;
  /** Writes the desired state; runs in the same transaction as the operation row. */
  applyDesiredState?: (tx: Transaction) => Promise<void>;
}

const ACTIVE_LOCK_INDEX = 'operation_active_per_project_idx';

/**
 * Writes the desired state and the operation row in one transaction and
 * enqueues the job in that same transaction, so a crash cannot leave a row
 * with no job or a job with no row. Throws {@link ProjectBusyError} when the
 * project already has an active operation.
 */
export async function createOperation(
  db: Database,
  queue: OperationQueue,
  input: CreateOperationInput,
): Promise<OperationRecord> {
  try {
    return await db.transaction(async (tx) => {
      const [active] = await tx
        .select({ id: operation.id })
        .from(operation)
        .where(
          and(
            eq(operation.consoleProjectId, input.consoleProjectId),
            inArray(operation.status, [...ACTIVE_OPERATION_STATUSES]),
          ),
        )
        .limit(1);
      if (active) throw new ProjectBusyError(input.consoleProjectId, active.id);

      await input.applyDesiredState?.(tx);

      const [created] = await tx
        .insert(operation)
        .values({
          id: newId('op'),
          consoleProjectId: input.consoleProjectId,
          targetType: input.targetType,
          targetId: input.targetId,
          action: input.action,
          params: input.params ?? {},
        })
        .returning();
      if (!created) throw new Error('Inserting the operation returned no row');

      await queue.enqueue(created.id, tx);
      return created;
    });
  } catch (error) {
    // Two requests can both pass the check above; the partial unique index decides.
    if (isUniqueViolation(error, ACTIVE_LOCK_INDEX)) {
      throw new ProjectBusyError(input.consoleProjectId);
    }
    throw error;
  }
}

/** Reads an operation, scoped to the console project that owns it. */
export async function findOperation(
  db: Database,
  id: string,
  consoleProjectId: string,
): Promise<OperationRecord | null> {
  const [row] = await db
    .select()
    .from(operation)
    .where(
      and(
        eq(operation.id, id),
        eq(operation.consoleProjectId, consoleProjectId),
      ),
    );
  return row ?? null;
}
