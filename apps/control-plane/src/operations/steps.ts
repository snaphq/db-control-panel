import type { OperationAction } from '../db/schema.js';
import type { OperationRecord } from './store.js';

interface StepContext {
  operation: OperationRecord;
  /** Outputs of earlier steps of this operation, keyed by step name. */
  outputs: Readonly<Record<string, unknown>>;
  /** Stable per-step key for downstream idempotency; see idempotency.ts. */
  idempotencyKey: string;
}

/**
 * One idempotent unit of work. A step may run more than once (a retry, or a
 * job redelivered after a crash), so it must converge on the same end state.
 * Whatever `run` returns is persisted in the operation's progress.
 */
export interface StepDefinition {
  name: string;
  run(context: StepContext): Promise<unknown>;
}

/** Throw from a step when retrying cannot help; the operation fails at once. */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

export class StepRegistry {
  readonly #steps = new Map<string, StepDefinition>();
  readonly #plans = new Map<OperationAction, string[]>();

  registerStep(step: StepDefinition): this {
    if (this.#steps.has(step.name)) {
      throw new Error(`Step "${step.name}" is already registered`);
    }
    this.#steps.set(step.name, step);
    return this;
  }

  /** Declares the ordered steps of an action. Every step must be registered first. */
  registerPlan(action: OperationAction, stepNames: string[]): this {
    if (this.#plans.has(action)) {
      throw new Error(`Action "${action}" already has a plan`);
    }
    if (stepNames.length === 0) {
      throw new Error(`The plan for "${action}" needs at least one step`);
    }
    for (const name of stepNames) {
      if (!this.#steps.has(name)) {
        throw new Error(
          `The plan for "${action}" names unknown step "${name}"`,
        );
      }
    }
    this.#plans.set(action, [...stepNames]);
    return this;
  }

  /** Steps to run for an action, in order. Throws when the action has no plan. */
  planFor(action: OperationAction): StepDefinition[] {
    const names = this.#plans.get(action);
    if (!names) {
      throw new NonRetryableError(
        `No steps are registered for action "${action}"`,
      );
    }
    return names.map((name) => {
      const step = this.#steps.get(name);
      if (!step)
        throw new Error(`Step "${name}" disappeared from the registry`);
      return step;
    });
  }
}

/** Does nothing; lets the runner, queue, and API be exercised before real steps exist. */
export const noopStep: StepDefinition = {
  name: 'noop',
  run: async () => ({ ok: true }),
};
