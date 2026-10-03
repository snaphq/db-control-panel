import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { newId } from '../crypto/ids.js';
import type { Database, Transaction } from '../db/client.js';
import {
  ACTIVE_OPERATION_STATUSES,
  type OperationAction,
  type OperationStatus,
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
  /** Recorded so reads can require the same organization as the creator. */
  consoleOrgId?: string;
  targetType: string;
  targetId: string;
  action: OperationAction;
  params?: Record<string, unknown>;
  /** Writes the desired state; runs in the same transaction as the operation row. */
  applyDesiredState?: (tx: Transaction) => Promise<void>;
  /** Longest one attempt of the job may run; see {@link OperationQueue}. */
  expireInSeconds?: number;
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
          consoleOrgId: input.consoleOrgId ?? null,
          targetType: input.targetType,
          targetId: input.targetId,
          action: input.action,
          params: input.params ?? {},
        })
        .returning();
      if (!created) throw new Error('Inserting the operation returned no row');

      await queue.enqueue(created.id, tx, {
        expireInSeconds: input.expireInSeconds,
      });
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

/**
 * Reads an operation, scoped to the console project that owns it and, when the
 * caller names one, to the organization that created it. Rows written before
 * the organization was recorded stay readable by project alone.
 */
export async function findOperation(
  db: Database,
  id: string,
  consoleProjectId: string,
  consoleOrgId?: string,
): Promise<OperationRecord | null> {
  const [row] = await db
    .select()
    .from(operation)
    .where(
      and(
        eq(operation.id, id),
        eq(operation.consoleProjectId, consoleProjectId),
        consoleOrgId === undefined
          ? undefined
          : or(
              isNull(operation.consoleOrgId),
              eq(operation.consoleOrgId, consoleOrgId),
            ),
      ),
    );
  return row ?? null;
}

export interface ListOperationsInput {
  consoleProjectId: string;
  consoleOrgId: string;
  /** `active` is `scheduling` or `running`; absent lists every status. */
  status?: 'active' | OperationStatus;
  limit: number;
  /** The `nextCursor` of the previous page. */
  cursor?: string;
}

export interface OperationPage {
  operations: OperationRecord[];
  /** Set when more operations follow; pass it back as `cursor`. */
  nextCursor: string | null;
}

/** The cursor does not name an operation in the caller's scope. */
export class InvalidCursorError extends Error {
  constructor() {
    super('The cursor is not valid for this list');
    this.name = 'InvalidCursorError';
  }
}

/**
 * Lists the operations of one console project, newest first, with the same
 * project and organization filter as {@link findOperation}. Pages are keyed by
 * `(created_at, id)`: the cursor is the last operation's id and the database
 * compares against that row's own timestamp, so no precision is lost.
 */
export async function listOperations(
  db: Database,
  input: ListOperationsInput,
): Promise<OperationPage> {
  const inScope = and(
    eq(operation.consoleProjectId, input.consoleProjectId),
    or(
      isNull(operation.consoleOrgId),
      eq(operation.consoleOrgId, input.consoleOrgId),
    ),
  );
  if (input.cursor !== undefined) {
    const [anchor] = await db
      .select({ id: operation.id })
      .from(operation)
      .where(and(inScope, eq(operation.id, input.cursor)));
    if (!anchor) throw new InvalidCursorError();
  }
  const rows = await db
    .select()
    .from(operation)
    .where(
      and(
        inScope,
        input.status === undefined
          ? undefined
          : input.status === 'active'
            ? inArray(operation.status, [...ACTIVE_OPERATION_STATUSES])
            : eq(operation.status, input.status),
        input.cursor === undefined
          ? undefined
          : sql`(${operation.createdAt}, ${operation.id}) < (select o.created_at, o.id from ${operation} o where o.id = ${input.cursor})`,
      ),
    )
    .orderBy(desc(operation.createdAt), desc(operation.id))
    .limit(input.limit + 1);
  const page = rows.slice(0, input.limit);
  const last = page.at(-1);
  return {
    operations: page,
    nextCursor: rows.length > input.limit && last ? last.id : null,
  };
}
