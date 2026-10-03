import { describe, expect, it } from 'vitest';
import { NonRetryableError, StepRegistry, noopStep } from './steps.js';

describe('StepRegistry', () => {
  it('resolves a plan to its steps in order', () => {
    const registry = new StepRegistry()
      .registerStep({ name: 'one', run: async () => 1 })
      .registerStep({ name: 'two', run: async () => 2 })
      .registerPlan('project.create', ['two', 'one']);
    expect(registry.planFor('project.create').map((s) => s.name)).toEqual([
      'two',
      'one',
    ]);
  });

  it('rejects duplicate steps and plans', () => {
    const registry = new StepRegistry().registerStep(noopStep);
    expect(() => registry.registerStep(noopStep)).toThrowError(
      /already registered/,
    );
    registry.registerPlan('branch.create', ['noop']);
    expect(() => registry.registerPlan('branch.create', ['noop'])).toThrowError(
      /already has a plan/,
    );
  });

  it('rejects plans that are empty or name unknown steps', () => {
    const registry = new StepRegistry();
    expect(() => registry.registerPlan('branch.create', [])).toThrowError(
      /at least one step/,
    );
    expect(() =>
      registry.registerPlan('branch.create', ['ghost']),
    ).toThrowError(/unknown step "ghost"/);
  });

  it('throws a non-retryable error for an action without a plan', () => {
    expect(() => new StepRegistry().planFor('libsql.create')).toThrowError(
      NonRetryableError,
    );
  });

  it('ships a no-op step that resolves', async () => {
    await expect(
      noopStep.run({
        operation: {} as never,
        outputs: {},
        idempotencyKey: 'op:noop',
        resume: undefined,
        checkpoint: async () => {},
      }),
    ).resolves.toEqual({ ok: true });
  });
});
