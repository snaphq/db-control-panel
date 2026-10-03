import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import {
  ACTIVE_OPERATION_STATUSES,
  operation,
  safekeeper,
} from '../db/schema.js';
import type { OperationQueue } from '../operations/queue.js';
import {
  ProjectBusyError,
  createOperation,
  findOperation,
  listOperations,
} from '../operations/repository.js';
import {
  PLATFORM_SCOPE,
  PlatformBusyError,
  type PlatformStore,
} from './store.js';

/**
 * The producer side of platform operations needs a queue (the API and the
 * worker's auto triggers); pass null where only reads happen.
 */
export function createDrizzlePlatformStore(
  db: Database,
  queue: OperationQueue | null,
): PlatformStore {
  const scoped = eq(
    operation.consoleProjectId,
    PLATFORM_SCOPE.consoleProjectId,
  );

  return {
    async listSafekeepers() {
      return db.select().from(safekeeper).orderBy(asc(safekeeper.id));
    },

    async getSafekeeper(id) {
      const [row] = await db
        .select()
        .from(safekeeper)
        .where(eq(safekeeper.id, id));
      return row ?? null;
    },

    async createSafekeeper(input) {
      const [row] = await db
        .insert(safekeeper)
        .values({
          nodeId: input.nodeId,
          nodeName: input.nodeName,
          operationId: input.operationId,
        })
        .returning();
      if (!row) throw new Error('Inserting the safekeeper returned no row');
      return row;
    },

    async setSafekeeperState(id, state) {
      const now = new Date();
      await db
        .update(safekeeper)
        .set({
          state,
          updatedAt: now,
          ...(state === 'retired' ? { retiredAt: now } : {}),
        })
        .where(eq(safekeeper.id, id));
    },

    async setSafekeeperDrain(id, drain) {
      await db
        .update(safekeeper)
        .set({ drain, updatedAt: new Date() })
        .where(eq(safekeeper.id, id));
    },

    async createOperation(input) {
      if (!queue) throw new Error('This platform store has no operation queue');
      try {
        return await createOperation(db, queue, {
          consoleProjectId: PLATFORM_SCOPE.consoleProjectId,
          consoleOrgId: PLATFORM_SCOPE.orgId,
          targetType: 'platform',
          targetId: 'platform',
          action: input.action,
          params: input.params,
        });
      } catch (error) {
        if (error instanceof ProjectBusyError) {
          throw new PlatformBusyError(error.activeOperationId);
        }
        throw error;
      }
    },

    findOperation: (id) =>
      findOperation(
        db,
        id,
        PLATFORM_SCOPE.consoleProjectId,
        PLATFORM_SCOPE.orgId,
      ),

    listOperations: (query) =>
      listOperations(db, {
        consoleProjectId: PLATFORM_SCOPE.consoleProjectId,
        consoleOrgId: PLATFORM_SCOPE.orgId,
        ...query,
      }),

    async latestOperation(action) {
      const [row] = await db
        .select()
        .from(operation)
        .where(and(scoped, eq(operation.action, action)))
        .orderBy(desc(operation.createdAt), desc(operation.id))
        .limit(1);
      return row ?? null;
    },

    async hasActiveOperation() {
      const [row] = await db
        .select({ id: operation.id })
        .from(operation)
        .where(
          and(
            scoped,
            inArray(operation.status, [...ACTIVE_OPERATION_STATUSES]),
          ),
        )
        .limit(1);
      return row !== undefined;
    },
  };
}
