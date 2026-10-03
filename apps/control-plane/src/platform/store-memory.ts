import { newId } from '../crypto/ids.js';
import { ACTIVE_OPERATION_STATUSES } from '../db/schema.js';
import { InvalidCursorError } from '../operations/repository.js';
import type { OperationRecord } from '../operations/store.js';
import {
  PLATFORM_SCOPE,
  PlatformBusyError,
  type PlatformStore,
  type SafekeeperRow,
} from './store.js';

export interface MemoryPlatformStore extends PlatformStore {
  operations: Map<string, OperationRecord>;
  safekeepers: Map<number, SafekeeperRow>;
}

const isActive = (record: OperationRecord) =>
  ACTIVE_OPERATION_STATUSES.some((status) => status === record.status);

/** In-memory {@link PlatformStore}; the contract suite keeps it honest against PostgreSQL. */
export function createMemoryPlatformStore(
  operations: Map<string, OperationRecord> = new Map(),
): MemoryPlatformStore {
  const safekeepers = new Map<number, SafekeeperRow>();
  let nextId = 1;
  const platform = () =>
    [...operations.values()]
      .filter(
        (record) => record.consoleProjectId === PLATFORM_SCOPE.consoleProjectId,
      )
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          (a.id < b.id ? 1 : -1),
      );
  const must = (id: number) => {
    const row = safekeepers.get(id);
    if (!row) throw new Error(`no safekeeper ${id}`);
    return row;
  };

  return {
    operations,
    safekeepers,

    async listSafekeepers() {
      return [...safekeepers.values()].sort((a, b) => a.id - b.id);
    },
    async getSafekeeper(id) {
      return safekeepers.get(id) ?? null;
    },
    async createSafekeeper(input) {
      const now = new Date();
      const row: SafekeeperRow = {
        id: nextId++,
        nodeId: input.nodeId,
        nodeName: input.nodeName,
        state: 'creating',
        operationId: input.operationId,
        drain: null,
        createdAt: now,
        updatedAt: now,
        retiredAt: null,
      };
      safekeepers.set(row.id, row);
      return row;
    },
    async setSafekeeperState(id, state) {
      const row = must(id);
      row.state = state;
      row.updatedAt = new Date();
      if (state === 'retired') row.retiredAt = row.updatedAt;
    },
    async setSafekeeperDrain(id, drain) {
      const row = must(id);
      row.drain = drain;
      row.updatedAt = new Date();
    },

    async createOperation(input) {
      const active = platform().find(isActive);
      if (active) throw new PlatformBusyError(active.id);
      const now = new Date();
      const record: OperationRecord = {
        id: newId('op'),
        consoleProjectId: PLATFORM_SCOPE.consoleProjectId,
        consoleOrgId: PLATFORM_SCOPE.orgId,
        targetType: 'platform',
        targetId: 'platform',
        action: input.action,
        status: 'scheduling',
        failuresCount: 0,
        error: null,
        params: input.params,
        progress: { completedSteps: [], outputs: {} },
        createdAt: now,
        updatedAt: now,
        finishedAt: null,
      };
      operations.set(record.id, record);
      return record;
    },
    async findOperation(id) {
      return platform().find((record) => record.id === id) ?? null;
    },
    async listOperations(query) {
      const all = platform();
      let rest = all;
      if (query.cursor !== undefined) {
        const at = all.findIndex((record) => record.id === query.cursor);
        if (at < 0) throw new InvalidCursorError();
        rest = all.slice(at + 1);
      }
      const matching = rest.filter((record) =>
        query.status === undefined
          ? true
          : query.status === 'active'
            ? isActive(record)
            : record.status === query.status,
      );
      const page = matching.slice(0, query.limit);
      return {
        operations: page,
        nextCursor:
          matching.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
    async latestOperation(action) {
      return platform().find((record) => record.action === action) ?? null;
    },
    async hasActiveOperation() {
      return platform().some(isActive);
    },
  };
}
