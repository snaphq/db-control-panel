import { COMPUTE_SIZES } from '@repo/control-plane-contract';
import { describe, expect, it } from 'vitest';
import {
  computeResources,
  isComputeSize,
  sizedSettings,
} from './compute-size.js';

describe('computeResources', () => {
  it('maps 1 CU to 1 vCPU and 4 GiB', () => {
    expect(computeResources('1')).toEqual({
      cpu: '1000m',
      memory: '4096Mi',
      memoryMiB: 4096,
    });
  });

  it('scales fractional and larger sizes', () => {
    expect(computeResources('0.25')).toMatchObject({
      cpu: '250m',
      memory: '1024Mi',
    });
    expect(computeResources('0.5')).toMatchObject({
      cpu: '500m',
      memory: '2048Mi',
    });
    expect(computeResources('8')).toMatchObject({
      cpu: '8000m',
      memory: '32768Mi',
    });
  });

  it('knows exactly the contract sizes and rejects others', () => {
    for (const size of COMPUTE_SIZES) expect(isComputeSize(size)).toBe(true);
    expect(isComputeSize('3')).toBe(false);
    expect(() => computeResources('3')).toThrowError(
      /Unknown compute size "3"/,
    );
  });
});

describe('sizedSettings', () => {
  it('scales max_connections linearly from 112 per quarter CU', () => {
    expect(sizedSettings('0.25').maxConnections).toBe(112);
    expect(sizedSettings('1').maxConnections).toBe(448);
    expect(sizedSettings('8').maxConnections).toBe(3584);
  });

  it('derives memory settings from the size', () => {
    expect(sizedSettings('0.25')).toMatchObject({
      sharedBuffersMiB: 128,
      effectiveCacheSizeMiB: 512,
      maintenanceWorkMemMiB: 64,
    });
    expect(sizedSettings('8')).toMatchObject({
      sharedBuffersMiB: 4096,
      effectiveCacheSizeMiB: 16384,
      maintenanceWorkMemMiB: 1024,
    });
  });
});
