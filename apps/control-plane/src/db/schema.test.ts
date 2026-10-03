import {
  OPERATION_ACTIONS as CONTRACT_ACTIONS,
  ENDPOINT_STATES as CONTRACT_ENDPOINT_STATES,
  ENDPOINT_TYPES as CONTRACT_ENDPOINT_TYPES,
  PLATFORM_OPERATION_ACTIONS as CONTRACT_PLATFORM_ACTIONS,
  SAFEKEEPER_STATES as CONTRACT_SAFEKEEPER_STATES,
  OPERATION_STATUSES as CONTRACT_STATUSES,
} from '@repo/control-plane-contract';
import { describe, expect, it } from 'vitest';
import {
  ENDPOINT_STATES,
  ENDPOINT_TYPES,
  OPERATION_ACTIONS,
  OPERATION_STATUSES,
  SAFEKEEPER_STATES,
} from './schema.js';

describe('schema enums match the public contract', () => {
  it('operation actions and statuses', () => {
    expect([...OPERATION_ACTIONS]).toEqual([
      ...CONTRACT_ACTIONS,
      ...CONTRACT_PLATFORM_ACTIONS,
    ]);
    expect([...OPERATION_STATUSES]).toEqual([...CONTRACT_STATUSES]);
  });

  it('safekeeper states', () => {
    expect([...SAFEKEEPER_STATES]).toEqual([...CONTRACT_SAFEKEEPER_STATES]);
  });

  it('endpoint types and states', () => {
    expect([...ENDPOINT_TYPES]).toEqual([...CONTRACT_ENDPOINT_TYPES]);
    expect([...ENDPOINT_STATES]).toEqual([...CONTRACT_ENDPOINT_STATES]);
  });
});
