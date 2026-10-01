import { describe, expect, it } from 'vitest';
import {
  type MemoryOperationStore,
  createMemoryOperationStore,
} from './memory-store.js';
import { runOperation } from './runner.js';
import { NonRetryableError, StepRegistry, noopStep } from './steps.js';

const silent = { info: () => {}, error: () => {} };

function setup() {
  const store = createMemoryOperationStore();
  const calls: string[] = [];
  const registry = new StepRegistry();
  return { store, calls, registry };
}

const options = (
  store: MemoryOperationStore,
  registry: StepRegistry,
  isFinalAttempt = false,
) => ({ store, registry, isFinalAttempt, logger: silent });

describe('runOperation', () => {
  it('runs the plan in order and finishes the operation', async () => {
    const { store, calls, registry } = setup();
    registry
      .registerStep({
        name: 'a',
        run: async () => {
          calls.push('a');
          return { tenant: 't1' };
        },
      })
      .registerStep({
        name: 'b',
        run: async (context) => {
          calls.push('b');
          expect(context.outputs.a).toEqual({ tenant: 't1' });
          expect(context.idempotencyKey).toBe('op_1:b');
        },
      })
      .registerPlan('project.create', ['a', 'b']);
    store.add('op_1', 'project.create');

    await expect(runOperation('op_1', options(store, registry))).resolves.toBe(
      'finished',
    );

    expect(calls).toEqual(['a', 'b']);
    const record = store.get('op_1');
    expect(record.status).toBe('finished');
    expect(record.finishedAt).not.toBeNull();
    expect(record.progress).toEqual({
      completedSteps: ['a', 'b'],
      outputs: { a: { tenant: 't1' }, b: null },
    });
  });

  it('runs the no-op step', async () => {
    const { store, registry } = setup();
    registry.registerStep(noopStep).registerPlan('branch.create', ['noop']);
    store.add('op_1', 'branch.create');

    await runOperation('op_1', options(store, registry));

    expect(store.get('op_1').status).toBe('finished');
    expect(store.get('op_1').progress.outputs.noop).toEqual({ ok: true });
  });

  it('retries from the failed step without repeating finished ones', async () => {
    const { store, calls, registry } = setup();
    let failOnce = true;
    registry
      .registerStep({
        name: 'first',
        run: async () => {
          calls.push('first');
        },
      })
      .registerStep({
        name: 'second',
        run: async () => {
          calls.push('second');
          if (failOnce) {
            failOnce = false;
            throw new Error('storage controller unavailable');
          }
        },
      })
      .registerPlan('endpoint.start', ['first', 'second']);
    store.add('op_1', 'endpoint.start');

    await expect(
      runOperation('op_1', options(store, registry)),
    ).rejects.toThrowError('storage controller unavailable');
    expect(store.get('op_1')).toMatchObject({
      status: 'running',
      failuresCount: 1,
      error: 'storage controller unavailable',
    });

    await expect(runOperation('op_1', options(store, registry))).resolves.toBe(
      'finished',
    );
    expect(calls).toEqual(['first', 'second', 'second']);
    expect(store.get('op_1')).toMatchObject({
      status: 'finished',
      error: null,
    });
  });

  it('fails terminally on the final attempt without rethrowing', async () => {
    const { store, registry } = setup();
    registry
      .registerStep({
        name: 'boom',
        run: async () => {
          throw new Error('still broken');
        },
      })
      .registerPlan('project.delete', ['boom']);
    store.add('op_1', 'project.delete');

    await expect(
      runOperation('op_1', options(store, registry, true)),
    ).resolves.toBe('failed');
    expect(store.get('op_1')).toMatchObject({
      status: 'failed',
      failuresCount: 1,
      error: 'still broken',
    });
  });

  it('fails at once on a non-retryable error', async () => {
    const { store, registry } = setup();
    registry
      .registerStep({
        name: 'validate',
        run: async () => {
          throw new NonRetryableError('branch name already exists');
        },
      })
      .registerPlan('branch.create', ['validate']);
    store.add('op_1', 'branch.create');

    await expect(runOperation('op_1', options(store, registry))).resolves.toBe(
      'failed',
    );
    expect(store.get('op_1').status).toBe('failed');
  });

  it('fails an operation whose action has no plan', async () => {
    const { store, registry } = setup();
    store.add('op_1', 'libsql.fork');

    await expect(runOperation('op_1', options(store, registry))).resolves.toBe(
      'failed',
    );
    expect(store.get('op_1').error).toMatch(
      /No steps are registered for action "libsql.fork"/,
    );
  });

  it('skips operations that are missing or already settled', async () => {
    const { store, registry } = setup();
    store.add('op_done', 'project.create', 'finished');
    store.add('op_cancelled', 'project.create', 'cancelled');

    for (const id of ['op_done', 'op_cancelled', 'op_missing']) {
      await expect(runOperation(id, options(store, registry))).resolves.toBe(
        'skipped',
      );
    }
    expect(store.get('op_done').status).toBe('finished');
  });
});
