import type { z } from 'zod';
import {
  NonRetryableError,
  type StepDefinition,
} from '../../operations/steps.js';
import type { ComputeRuntime } from '../compute-runtime.js';
import { EndpointNotFoundError } from '../spec-service.js';
import type { StorconClient } from '../storcon-client.js';
import type { NeonStore } from '../store.js';

/** What the Neon steps close over. */
export interface NeonStepDeps {
  store: NeonStore;
  storcon: StorconClient;
  runtime: ComputeRuntime;
}

export type StepContext = Parameters<StepDefinition['run']>[0];

/**
 * Reads an operation's request parameters. They were written by the API in the
 * same transaction as the desired state, so a mismatch is a bug and retrying
 * cannot fix it.
 */
export function readParams<T>(
  context: StepContext,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): T {
  const parsed = schema.safeParse(context.operation.params);
  if (!parsed.success) {
    throw new NonRetryableError(
      `Operation ${context.operation.id} (${context.operation.action}) has invalid params: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

/** A row the operation was created for is gone: nothing to retry. */
export function gone(what: string, id: string): NonRetryableError {
  return new NonRetryableError(`${what} ${id} no longer exists`);
}

/** Runs a runtime call, turning "no such endpoint" into a non-retryable failure. */
export async function forEndpoint<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof EndpointNotFoundError) {
      throw new NonRetryableError(error.message);
    }
    throw error;
  }
}
