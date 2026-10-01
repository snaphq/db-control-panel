import type { OperationAction, OperationStatus } from '../db/schema.js';
import type { OperationRecord, OperationStore } from './store.js';

/** In-memory {@link OperationStore} for unit tests, plus helpers to seed and inspect it. */
export interface MemoryOperationStore extends OperationStore {
  records: Map<string, OperationRecord>;
  add(
    id: string,
    action: OperationAction,
    status?: OperationStatus,
  ): OperationRecord;
  get(id: string): OperationRecord;
}

export function createMemoryOperationStore(): MemoryOperationStore {
  const records = new Map<string, OperationRecord>();

  const get = (id: string): OperationRecord => {
    const record = records.get(id);
    if (!record) throw new Error(`no operation ${id}`);
    return record;
  };

  return {
    records,
    get,

    add(id, action, status = 'scheduling') {
      const now = new Date('2026-01-01T00:00:00Z');
      const record: OperationRecord = {
        id,
        consoleProjectId: 'console-project',
        consoleOrgId: null,
        targetType: 'project',
        targetId: 'proj_1',
        action,
        status,
        failuresCount: 0,
        error: null,
        params: {},
        progress: { completedSteps: [], outputs: {} },
        createdAt: now,
        updatedAt: now,
        finishedAt: null,
      };
      records.set(id, record);
      return record;
    },

    async load(id) {
      return records.get(id) ?? null;
    },

    async markRunning(id) {
      const record = records.get(id);
      if (!record || !['scheduling', 'running'].includes(record.status)) {
        return null;
      }
      record.status = 'running';
      return structuredClone(record);
    },

    async saveProgress(id, progress) {
      get(id).progress = structuredClone(progress);
    },

    async markFinished(id) {
      const record = get(id);
      record.status = 'finished';
      record.error = null;
      record.finishedAt = new Date();
    },

    async recordFailure(id, message, terminal) {
      const record = get(id);
      record.failuresCount += 1;
      record.error = message;
      if (terminal) {
        record.status = 'failed';
        record.finishedAt = new Date();
      }
    },
  };
}
