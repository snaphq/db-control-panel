import { describe, expect, it } from 'vitest';
import { PlatformBusyError, type PlatformStore } from './store.js';

export interface PlatformHarness {
  store: PlatformStore;
  /** Settles an operation so the platform accepts the next one. */
  finish(operationId: string): Promise<void>;
}

/**
 * Behaviour every {@link PlatformStore} must have. Run against the in-memory
 * store always and against PostgreSQL when CONTROL_PLANE_TEST_DATABASE_URL is
 * set. Safekeeper ids are shared across the table, so tests compare against ids
 * they created, never absolute numbers.
 */
export function describePlatformStoreContract(
  name: string,
  setup: () => Promise<PlatformHarness>,
  describeFn: typeof describe = describe,
): void {
  describeFn(`PlatformStore contract: ${name}`, () => {
    it('hands out increasing safekeeper ids and never reuses a retired one', async () => {
      const { store } = await setup();
      const a = await store.createSafekeeper({
        nodeId: 1,
        nodeName: 'node-1',
        operationId: null,
      });
      expect(a).toMatchObject({
        state: 'creating',
        drain: null,
        retiredAt: null,
      });
      await store.setSafekeeperState(a.id, 'retired');
      const b = await store.createSafekeeper({
        nodeId: 2,
        nodeName: 'node-2',
        operationId: 'op_x',
      });
      expect(b.id).toBeGreaterThan(a.id);
      expect(b.operationId).toBe('op_x');
      expect((await store.getSafekeeper(a.id))?.retiredAt).toBeInstanceOf(Date);
      expect((await store.listSafekeepers()).map((r) => r.id)).toEqual(
        expect.arrayContaining([a.id, b.id]),
      );
    });

    it('moves a safekeeper through its states and records drain progress', async () => {
      const { store } = await setup();
      const row = await store.createSafekeeper({
        nodeId: 1,
        nodeName: 'node-1',
        operationId: null,
      });
      await store.setSafekeeperState(row.id, 'active');
      await store.setSafekeeperState(row.id, 'retiring');
      const drain = {
        total: 3,
        migrated: 1,
        failed: [{ timeline: 't/tl', reason: 'conflict' }],
        updatedAt: '2026-10-03T00:00:00.000Z',
      };
      await store.setSafekeeperDrain(row.id, drain);
      const read = await store.getSafekeeper(row.id);
      expect(read?.state).toBe('retiring');
      expect(read?.drain).toEqual(drain);
      await store.setSafekeeperDrain(row.id, null);
      expect((await store.getSafekeeper(row.id))?.drain).toBeNull();
      expect(await store.getSafekeeper(2_000_000_000)).toBeNull();
    });

    it('runs one platform operation at a time, whatever the action', async () => {
      const harness = await setup();
      const { store } = harness;
      const first = await store.createOperation({
        action: 'pageservers.rebalance',
        params: { reason: 'manual' },
      });
      expect(first).toMatchObject({
        action: 'pageservers.rebalance',
        status: 'scheduling',
        targetType: 'platform',
        params: { reason: 'manual' },
      });
      expect(await store.hasActiveOperation()).toBe(true);

      const busy = await store
        .createOperation({ action: 'safekeepers.spread', params: {} })
        .catch((error) => error);
      expect(busy).toBeInstanceOf(PlatformBusyError);
      expect(busy.activeOperationId).toBe(first.id);

      await harness.finish(first.id);
      expect(await store.hasActiveOperation()).toBe(false);
      const second = await store.createOperation({
        action: 'safekeepers.spread',
        params: {},
      });
      await harness.finish(second.id);
    });

    it('finds, lists and pages platform operations newest first', async () => {
      const harness = await setup();
      const { store } = harness;
      const ids: string[] = [];
      for (const action of [
        'pageservers.rebalance',
        'safekeepers.spread',
        'pageservers.rebalance',
      ] as const) {
        const op = await store.createOperation({ action, params: {} });
        ids.push(op.id);
        await harness.finish(op.id);
      }
      expect((await store.findOperation(ids[0] as string))?.id).toBe(ids[0]);
      expect(await store.findOperation('op_missing')).toBeNull();
      expect((await store.latestOperation('safekeepers.spread'))?.id).toBe(
        ids[1],
      );

      const page = await store.listOperations({ limit: 2 });
      expect(page.operations).toHaveLength(2);
      expect(page.nextCursor).toBe(page.operations[1]?.id);
      const rest = await store.listOperations({
        limit: 2,
        cursor: page.nextCursor ?? undefined,
      });
      expect(rest.operations.length).toBeGreaterThanOrEqual(1);
      expect(
        await store.listOperations({ limit: 5, status: 'active' }),
      ).toEqual({
        operations: [],
        nextCursor: null,
      });
    });
  });
}
