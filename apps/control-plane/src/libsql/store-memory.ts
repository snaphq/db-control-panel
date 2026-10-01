import type { MemoryNeonStore } from '../neon/store-memory.js';
import type { LibsqlStore } from './store.js';

/**
 * In-memory {@link LibsqlStore} over the same maps as the Neon store, so one
 * `commit` (and one operation lock) serves both, as in PostgreSQL.
 */
export function createMemoryLibsqlStore(neon: MemoryNeonStore): LibsqlStore {
  const live = () =>
    [...neon.libsqlDatabases.values()]
      .filter((d) => d.deletedAt === null)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const owned = (
    scope: { orgId: string; consoleProjectId: string },
    id: string,
  ) => {
    const found = neon.libsqlDatabases.get(id);
    return found &&
      found.deletedAt === null &&
      found.consoleOrgId === scope.orgId &&
      found.consoleProjectId === scope.consoleProjectId
      ? found
      : null;
  };

  return {
    async list(scope) {
      return live().filter(
        (d) =>
          d.consoleOrgId === scope.orgId &&
          d.consoleProjectId === scope.consoleProjectId,
      );
    },
    async find(scope, id) {
      return owned(scope, id);
    },
    async findByNamespace(namespace) {
      return live().find((d) => d.namespace === namespace) ?? null;
    },
    async countByNode() {
      const counts = new Map<number, number>();
      for (const d of live()) {
        counts.set(d.nodeId, (counts.get(d.nodeId) ?? 0) + 1);
      }
      return counts;
    },
    listNodes: () => neon.listNodes(),
    commit: (scope, operation, changes) =>
      neon.commit(scope, operation, changes),

    async get(id, options) {
      const found = neon.libsqlDatabases.get(id);
      if (!found || (found.deletedAt && !options?.includeDeleted)) return null;
      return found;
    },
    async getNode(id) {
      return neon.nodes.get(id) ?? null;
    },
    async setState(id, state) {
      const found = neon.libsqlDatabases.get(id);
      if (found) found.state = state;
    },
  };
}
