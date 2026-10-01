import { createHash } from 'node:crypto';

/**
 * Key that names one step of one operation. Pass it wherever a downstream
 * system accepts an idempotency key so a retried step repeats the same request.
 */
export function stepKey(operationId: string, step: string): string {
  return `${operationId}:${step}`;
}

/**
 * Derives a 32-hex Neon id from an operation id and a purpose, so a retried
 * `project.create` asks the storage controller for the same tenant and
 * timeline instead of leaking a new one on every attempt.
 */
export function deterministicNeonId(
  operationId: string,
  purpose: string,
): string {
  return createHash('sha256')
    .update(`${operationId}\u0000${purpose}`)
    .digest('hex')
    .slice(0, 32);
}

const UNIQUE_VIOLATION = '23505';

/** Walks `cause` because Drizzle wraps driver errors in `DrizzleQueryError`. */
export function isUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth++) {
    const { code, constraint_name: name } = current as {
      code?: string;
      constraint_name?: string;
    };
    if (code === UNIQUE_VIOLATION) {
      return constraint === undefined || name === constraint;
    }
    current = current.cause;
  }
  return false;
}
