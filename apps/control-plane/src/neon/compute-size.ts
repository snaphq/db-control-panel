import { COMPUTE_SIZES, type ComputeSize } from '@repo/control-plane-contract';

export type { ComputeSize };

/** 1 CU is 1 vCPU and 4 GiB of memory (see db/schema.ts, `endpoint.compute_size`). */
const GIB_PER_CU = 4;
const MIB_PER_GIB = 1024;

export interface ComputeResources {
  /** Kubernetes quantity, e.g. `250m`. */
  cpu: string;
  /** Kubernetes quantity in MiB, e.g. `1024Mi`. */
  memory: string;
  /** The same memory, as a number for Postgres settings. */
  memoryMiB: number;
}

export function isComputeSize(value: string): value is ComputeSize {
  return (COMPUTE_SIZES as readonly string[]).includes(value);
}

export function computeResources(size: string): ComputeResources {
  if (!isComputeSize(size)) {
    throw new Error(
      `Unknown compute size "${size}" (one of ${COMPUTE_SIZES.join(', ')})`,
    );
  }
  const units = Number(size);
  const memoryMiB = Math.round(units * GIB_PER_CU * MIB_PER_GIB);
  return {
    cpu: `${Math.round(units * 1000)}m`,
    memory: `${memoryMiB}Mi`,
    memoryMiB,
  };
}

/** Postgres settings that scale with the compute size. */
export interface SizedSettings {
  maxConnections: number;
  sharedBuffersMiB: number;
  effectiveCacheSizeMiB: number;
  maintenanceWorkMemMiB: number;
}

/**
 * Starting points scaled linearly from the smallest size: 112 connections per
 * quarter CU, `shared_buffers` an eighth of memory, `effective_cache_size`
 * half of it. They are chosen here, not copied from Neon; the spec carries
 * them on every start, so changing the numbers takes effect on the next wake.
 */
export function sizedSettings(size: string): SizedSettings {
  const { memoryMiB } = computeResources(size);
  const quarterUnits = Number(size) * 4;
  return {
    maxConnections: Math.round(112 * quarterUnits),
    sharedBuffersMiB: Math.max(128, Math.floor(memoryMiB / 8)),
    effectiveCacheSizeMiB: Math.floor(memoryMiB / 2),
    maintenanceWorkMemMiB: Math.min(
      1024,
      Math.max(64, Math.floor(memoryMiB / 16)),
    ),
  };
}
