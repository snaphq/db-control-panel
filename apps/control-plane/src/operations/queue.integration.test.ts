import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/client.js';
import type { DatabaseHandle } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import {
  createBoss,
  createOperationQueue,
  startOperationWorker,
  startQueue,
} from './queue.js';
import { createOperation, findOperation } from './repository.js';
import { StepRegistry, noopStep } from './steps.js';
import { createOperationStore } from './store.js';

/**
 * Same opt-in as repository.integration.test.ts. pg-boss needs PostgreSQL 13+
 * (`gen_random_uuid()`); the platform Postgres is 17.
 */
const url = process.env.CONTROL_PLANE_TEST_DATABASE_URL;

async function waitFor<T>(read: () => Promise<T | null>, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('timed out waiting for the operation');
}

describe.skipIf(!url)('operations queue against PostgreSQL', () => {
  let handle: DatabaseHandle;
  const producer = createBoss(url as string, 'producer');
  const worker = createBoss(url as string, 'worker');

  beforeAll(async () => {
    handle = createDatabase(url as string, { max: 4 });
    await runMigrations(handle, { info: () => {} });
    await startQueue(worker);
    await startQueue(producer);
  });

  afterAll(async () => {
    await producer.stop({ graceful: true, timeout: 5_000 });
    await worker.stop({ graceful: true, timeout: 5_000 });
    await handle.close();
  });

  it('runs an operation enqueued in the same transaction that created it', async () => {
    const registry = new StepRegistry()
      .registerStep(noopStep)
      .registerPlan('project.create', ['noop']);
    await startOperationWorker(worker, {
      store: createOperationStore(handle.db),
      registry,
      concurrency: 1,
    });

    const created = await createOperation(
      handle.db,
      createOperationQueue(producer),
      {
        consoleProjectId: 'cp-queue',
        targetType: 'project',
        targetId: 'proj_queue',
        action: 'project.create',
      },
    );

    const finished = await waitFor(async () => {
      const row = await findOperation(handle.db, created.id, 'cp-queue');
      return row?.status === 'finished' ? row : null;
    });
    expect(finished.progress).toEqual({
      completedSteps: ['noop'],
      outputs: { noop: { ok: true } },
    });
  });
});
