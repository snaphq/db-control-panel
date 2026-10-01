import { describe, expect, it } from 'vitest';
import { isNeonId } from '../crypto/ids.js';
import {
  deterministicNeonId,
  isUniqueViolation,
  stepKey,
} from './idempotency.js';

describe('stepKey', () => {
  it('joins the operation id and step name', () => {
    expect(stepKey('op_abc', 'create-tenant')).toBe('op_abc:create-tenant');
  });
});

describe('deterministicNeonId', () => {
  it('returns the same 32-hex id for the same operation and purpose', () => {
    const first = deterministicNeonId('op_1', 'timeline');
    expect(first).toBe(deterministicNeonId('op_1', 'timeline'));
    expect(isNeonId(first)).toBe(true);
  });

  it('differs by operation and by purpose', () => {
    const ids = new Set([
      deterministicNeonId('op_1', 'tenant'),
      deterministicNeonId('op_1', 'timeline'),
      deterministicNeonId('op_2', 'tenant'),
    ]);
    expect(ids.size).toBe(3);
  });

  it('does not let purpose and operation id blur together', () => {
    expect(deterministicNeonId('op_1a', 'b')).not.toBe(
      deterministicNeonId('op_1', 'ab'),
    );
  });
});

describe('isUniqueViolation', () => {
  const violation = (constraint: string) =>
    Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint_name: constraint,
    });

  it('recognizes SQLSTATE 23505, also through a wrapped cause', () => {
    expect(isUniqueViolation(violation('x'))).toBe(true);
    const wrapped = new Error('Failed query', { cause: violation('x') });
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it('can require a specific constraint', () => {
    expect(isUniqueViolation(violation('a'), 'a')).toBe(true);
    expect(isUniqueViolation(violation('a'), 'b')).toBe(false);
  });

  it('ignores other errors', () => {
    expect(isUniqueViolation(new Error('nope'))).toBe(false);
    expect(
      isUniqueViolation(Object.assign(new Error('x'), { code: '40001' })),
    ).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
  });
});
