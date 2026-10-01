import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/client.js';
import type { DatabaseHandle } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { neonProject, operation } from '../db/schema.js';
import {
  InvalidCursorError,
  ProjectBusyError,
  createOperation,
  findOperation,
  listOperations,
} from './repository.js';
import { createOperationStore } from './store.js';

/**
 * Runs against a real PostgreSQL. Set CONTROL_PLANE_TEST_DATABASE_URL to an
 * empty, disposable database (no Docker needed: any local `postgres` works);
 * without it the suite is skipped, like other service-backed suites.
 */
const url = process.env.CONTROL_PLANE_TEST_DATABASE_URL;

describe.skipIf(!url)('operations against PostgreSQL', () => {
  let handle: DatabaseHandle;
  const enqueued: string[] = [];
  const queue = {
    enqueue: async (operationId: string) => {
      enqueued.push(operationId);
    },
  };

  beforeAll(async () => {
    handle = createDatabase(url as string, { max: 4 });
    await runMigrations(handle, { info: () => {} });
  });

  afterAll(async () => {
    await handle.close();
  });

  it('applies migrations twice without error (second run is a no-op)', async () => {
    await runMigrations(handle, { info: () => {} });
  });

  it('writes desired state, the operation row, and the job together', async () => {
    const op = await createOperation(handle.db, queue, {
      consoleProjectId: 'cp-atomic',
      targetType: 'project',
      targetId: 'proj_atomic',
      action: 'project.create',
      params: { name: 'demo' },
      applyDesiredState: async (tx) => {
        await tx.insert(neonProject).values({
          id: 'proj_atomic',
          consoleProjectId: 'cp-atomic',
          consoleOrgId: 'org_1',
          name: 'demo',
          tenantId: 'a'.repeat(32),
        });
      },
    });
    expect(op.status).toBe('scheduling');
    expect(enqueued).toContain(op.id);
    const [project] = await handle.db
      .select()
      .from(neonProject)
      .where(eq(neonProject.id, 'proj_atomic'));
    expect(project?.name).toBe('demo');
  });

  it('rolls back the desired state when enqueueing fails', async () => {
    await expect(
      createOperation(
        handle.db,
        {
          enqueue: async () => {
            throw new Error('queue down');
          },
        },
        {
          consoleProjectId: 'cp-rollback',
          targetType: 'project',
          targetId: 'proj_rollback',
          action: 'project.create',
          applyDesiredState: async (tx) => {
            await tx.insert(neonProject).values({
              id: 'proj_rollback',
              consoleProjectId: 'cp-rollback',
              consoleOrgId: 'org_1',
              name: 'rollback',
              tenantId: 'b'.repeat(32),
            });
          },
        },
      ),
    ).rejects.toThrowError('queue down');
    const rows = await handle.db
      .select()
      .from(neonProject)
      .where(eq(neonProject.id, 'proj_rollback'));
    expect(rows).toHaveLength(0);
  });

  it('rejects a second mutation with 423 while one is active', async () => {
    const input = {
      consoleProjectId: 'cp-busy',
      targetType: 'branch',
      targetId: 'br_1',
      action: 'branch.create' as const,
    };
    const first = await createOperation(handle.db, queue, input);
    const error = await createOperation(handle.db, queue, input).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ProjectBusyError);
    expect((error as ProjectBusyError).status).toBe(423);
    expect((error as ProjectBusyError).activeOperationId).toBe(first.id);

    await createOperationStore(handle.db).markFinished(first.id);
    await expect(
      createOperation(handle.db, queue, input),
    ).resolves.toBeTruthy();
  });

  it('lets exactly one of several concurrent mutations through', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        createOperation(handle.db, queue, {
          consoleProjectId: 'cp-race',
          targetType: 'project',
          targetId: 'proj_race',
          action: 'endpoint.start',
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(ProjectBusyError);
      }
    }
  });

  it('does not lock other projects', async () => {
    const make = (consoleProjectId: string) =>
      createOperation(handle.db, queue, {
        consoleProjectId,
        targetType: 'project',
        targetId: 'x',
        action: 'endpoint.suspend',
      });
    await expect(
      Promise.all([make('cp-a'), make('cp-b')]),
    ).resolves.toHaveLength(2);
  });

  it('scopes reads to the owning console project', async () => {
    const op = await createOperation(handle.db, queue, {
      consoleProjectId: 'cp-read',
      targetType: 'project',
      targetId: 'x',
      action: 'project.delete',
    });
    expect((await findOperation(handle.db, op.id, 'cp-read'))?.id).toBe(op.id);
    expect(await findOperation(handle.db, op.id, 'other-project')).toBeNull();
  });

  it('tracks progress and failures through the store', async () => {
    const store = createOperationStore(handle.db);
    const op = await createOperation(handle.db, queue, {
      consoleProjectId: 'cp-store',
      targetType: 'project',
      targetId: 'x',
      action: 'database.create',
    });
    expect((await store.markRunning(op.id))?.status).toBe('running');
    await store.saveProgress(op.id, {
      completedSteps: ['a'],
      outputs: { a: 1 },
    });
    await store.recordFailure(op.id, 'transient', false);
    await store.recordFailure(op.id, 'fatal', true);
    const [row] = await handle.db
      .select()
      .from(operation)
      .where(eq(operation.id, op.id));
    expect(row).toMatchObject({
      status: 'failed',
      failuresCount: 2,
      error: 'fatal',
      progress: { completedSteps: ['a'], outputs: { a: 1 } },
    });
    expect(row?.finishedAt).not.toBeNull();
    expect(await store.markRunning(op.id)).toBeNull();
  });

  describe('listOperations', () => {
    const store = () => createOperationStore(handle.db);
    const make = (consoleProjectId: string, consoleOrgId?: string) =>
      createOperation(handle.db, queue, {
        consoleProjectId,
        consoleOrgId,
        targetType: 'branch',
        targetId: 'br_1',
        action: 'branch.create',
      });

    /** Three finished operations and one still scheduling, oldest first. */
    async function history(consoleProjectId: string, org: string) {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const op = await make(consoleProjectId, org);
        await store().markFinished(op.id);
        ids.push(op.id);
      }
      ids.push((await make(consoleProjectId, org)).id);
      return ids;
    }

    it('pages newest first with a cursor and loses no row', async () => {
      const ids = await history('cp-list-a', 'org_1');
      const first = await listOperations(handle.db, {
        consoleProjectId: 'cp-list-a',
        consoleOrgId: 'org_1',
        limit: 3,
      });
      expect(first.operations.map((o) => o.id)).toEqual(
        [...ids].reverse().slice(0, 3),
      );
      expect(first.nextCursor).toBe(first.operations[2]?.id);
      const second = await listOperations(handle.db, {
        consoleProjectId: 'cp-list-a',
        consoleOrgId: 'org_1',
        limit: 3,
        cursor: first.nextCursor ?? undefined,
      });
      expect(second.operations.map((o) => o.id)).toEqual([ids[0]]);
      expect(second.nextCursor).toBeNull();
    });

    it('filters by active and by one status', async () => {
      const ids = await history('cp-list-b', 'org_1');
      const scope = { consoleProjectId: 'cp-list-b', consoleOrgId: 'org_1' };
      const active = await listOperations(handle.db, {
        ...scope,
        limit: 10,
        status: 'active',
      });
      expect(active.operations.map((o) => o.id)).toEqual([ids[3]]);
      const finished = await listOperations(handle.db, {
        ...scope,
        limit: 10,
        status: 'finished',
      });
      expect(finished.operations).toHaveLength(3);
    });

    it('never returns or accepts rows of another project or organization', async () => {
      const ids = await history('cp-list-c', 'org_1');
      const other = { consoleProjectId: 'cp-list-c', consoleOrgId: 'org_2' };
      expect(
        (await listOperations(handle.db, { ...other, limit: 10 })).operations,
      ).toEqual([]);
      const elsewhere = {
        consoleProjectId: 'cp-list-d',
        consoleOrgId: 'org_1',
      };
      expect(
        (await listOperations(handle.db, { ...elsewhere, limit: 10 }))
          .operations,
      ).toEqual([]);
      await expect(
        listOperations(handle.db, {
          ...elsewhere,
          limit: 10,
          cursor: ids[1],
        }),
      ).rejects.toBeInstanceOf(InvalidCursorError);
    });
  });
});
