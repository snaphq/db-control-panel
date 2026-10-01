import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { libsqlDatabase, node } from '../db/schema.js';
import { applyChange } from '../neon/changes-drizzle.js';
import type { OperationQueue } from '../operations/queue.js';
import { createOperation } from '../operations/repository.js';
import type { LibsqlStore } from './store.js';

const live = isNull(libsqlDatabase.deletedAt);

/** `queue` is only needed by the API, which commits operations; the worker passes null. */
export function createDrizzleLibsqlStore(
  db: Database,
  queue: OperationQueue | null,
): LibsqlStore {
  const scoped = (scope: { orgId: string; consoleProjectId: string }) =>
    and(
      eq(libsqlDatabase.consoleOrgId, scope.orgId),
      eq(libsqlDatabase.consoleProjectId, scope.consoleProjectId),
      live,
    );

  return {
    async list(scope) {
      return db
        .select()
        .from(libsqlDatabase)
        .where(scoped(scope))
        .orderBy(asc(libsqlDatabase.createdAt), asc(libsqlDatabase.id));
    },
    async find(scope, id) {
      const [row] = await db
        .select()
        .from(libsqlDatabase)
        .where(and(eq(libsqlDatabase.id, id), scoped(scope)));
      return row ?? null;
    },
    async findByNamespace(namespace) {
      const [row] = await db
        .select()
        .from(libsqlDatabase)
        .where(and(eq(libsqlDatabase.namespace, namespace), live));
      return row ?? null;
    },
    async countByNode() {
      const rows = await db
        .select({
          nodeId: libsqlDatabase.nodeId,
          count: sql<number>`count(*)::int`,
        })
        .from(libsqlDatabase)
        .where(live)
        .groupBy(libsqlDatabase.nodeId);
      return new Map(rows.map((r) => [r.nodeId, r.count]));
    },
    async listNodes() {
      return db.select().from(node).orderBy(asc(node.id));
    },
    commit(scope, input, changes) {
      if (!queue) {
        throw new Error('This store was created without an operation queue');
      }
      return createOperation(db, queue, {
        consoleProjectId: scope.consoleProjectId,
        consoleOrgId: scope.orgId,
        targetType: input.targetType,
        targetId: input.targetId,
        action: input.action,
        params: input.params,
        applyDesiredState: async (tx) => {
          for (const change of changes) await applyChange(tx, change);
        },
      });
    },

    async get(id, options) {
      const [row] = await db
        .select()
        .from(libsqlDatabase)
        .where(
          and(
            eq(libsqlDatabase.id, id),
            options?.includeDeleted ? undefined : live,
          ),
        );
      return row ?? null;
    },
    async getNode(id) {
      const [row] = await db.select().from(node).where(eq(node.id, id));
      return row ?? null;
    },
    async setState(id, state) {
      await db
        .update(libsqlDatabase)
        .set({ state })
        .where(eq(libsqlDatabase.id, id));
    },
  };
}
