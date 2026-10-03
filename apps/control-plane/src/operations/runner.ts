import type { OperationProgress } from '../db/schema.js';
import { stepKey } from './idempotency.js';
import { NonRetryableError, type StepRegistry } from './steps.js';
import type { OperationStore } from './store.js';

export type RunOutcome = 'finished' | 'failed' | 'skipped';

interface RunnerLogger {
  info(message: string): void;
  error(message: string): void;
}

export interface RunOperationOptions {
  store: OperationStore;
  registry: StepRegistry;
  /** True when the queue will not redeliver this job after a failure. */
  isFinalAttempt: boolean;
  logger?: RunnerLogger;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Executes the plan of one operation. Progress is saved after every step, so a
 * redelivered job resumes after the last completed step and never repeats it.
 *
 * A retryable failure is recorded and rethrown so the queue redelivers the job.
 * A terminal failure (non-retryable error, or the final attempt) marks the
 * operation `failed` and returns normally: there is nothing left to retry.
 */
export async function runOperation(
  operationId: string,
  options: RunOperationOptions,
): Promise<RunOutcome> {
  const { store, registry, isFinalAttempt, logger = console } = options;

  const record = await store.markRunning(operationId);
  if (!record) {
    logger.info(
      `operation ${operationId} is missing or already settled; skipping`,
    );
    return 'skipped';
  }

  const progress: OperationProgress = {
    completedSteps: [...record.progress.completedSteps],
    outputs: { ...record.progress.outputs },
  };

  try {
    for (const step of registry.planFor(record.action)) {
      if (progress.completedSteps.includes(step.name)) continue;
      logger.info(`operation ${operationId}: running step ${step.name}`);
      const output = await step.run({
        operation: record,
        outputs: progress.outputs,
        idempotencyKey: stepKey(operationId, step.name),
        resume: progress.outputs[step.name],
        async checkpoint(value) {
          progress.outputs[step.name] = value;
          await store.saveProgress(operationId, progress);
        },
      });
      progress.completedSteps.push(step.name);
      progress.outputs[step.name] = output ?? null;
      await store.saveProgress(operationId, progress);
    }
  } catch (error) {
    const message = errorMessage(error);
    const terminal = isFinalAttempt || error instanceof NonRetryableError;
    logger.error(
      `operation ${operationId} failed (${terminal ? 'terminal' : 'will retry'}): ${message}`,
    );
    await store.recordFailure(operationId, message, terminal);
    if (terminal) return 'failed';
    throw error;
  }

  await store.markFinished(operationId);
  return 'finished';
}
