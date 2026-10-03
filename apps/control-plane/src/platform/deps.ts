import type { StorconAdminClient } from '../neon/storcon-admin.js';
import type { StorconClient } from '../neon/storcon-client.js';
import type { NeonStore } from '../neon/store.js';
import type { SafekeeperApi } from './safekeeper-client.js';
import type { SafekeeperKube } from './safekeeper-kube.js';
import type { SafekeeperWorkload } from './safekeeper-manifests.js';
import type { PlatformStore, SafekeeperRow } from './store.js';

export interface PlatformConfig {
  /** Safekeepers to run; must equal the controller's `--timeline-safekeeper-count`. */
  safekeeperCount: number;
  neonImage: string;
  /** Pull Secret named on safekeeper pods, or null for none. */
  pullSecret: string | null;
  entrypointConfigMap: string;
  /** Size of each safekeeper's volume, a Kubernetes quantity such as `50Gi`. */
  safekeeperStorage: string;
  /** Timelines moved at once while draining a safekeeper. */
  migrateConcurrency: number;
  /** Largest number of pageserver moves per rebalance run. */
  rebalanceMaxMoves: number;
  /** Graceful (prewarmed) pageserver moves, or immediate cut-over. */
  rebalancePrewarm: boolean;
  /** How long one tenant move may take to settle before it is cancelled. */
  settleTimeoutMs: number;
  /** How long a step waits for something to settle before it fails and is retried. */
  waitTimeoutMs: number;
  pollIntervalMs: number;
}

/** What the platform steps and loops close over. */
export interface PlatformDeps {
  platform: PlatformStore;
  neon: Pick<
    NeonStore,
    'listNodes' | 'listTenantsWithActiveOperations' | 'upsertNode'
  >;
  storcon: StorconClient;
  admin: StorconAdminClient;
  kube: SafekeeperKube;
  safekeepers: SafekeeperApi;
  config: PlatformConfig;
  /** Test hooks: the clock and waiting, replaced together by a fake clock. */
  now(): number;
  sleep(ms: number): Promise<void>;
  logger: { info(message: string): void; warn(message: string): void };
}

export function workloadFor(
  deps: Pick<PlatformDeps, 'config'>,
  row: Pick<SafekeeperRow, 'id' | 'nodeName'>,
): SafekeeperWorkload {
  const { config } = deps;
  return {
    id: row.id,
    nodeName: row.nodeName,
    image: config.neonImage,
    pullSecret: config.pullSecret,
    entrypointConfigMap: config.entrypointConfigMap,
    storage: config.safekeeperStorage,
  };
}
