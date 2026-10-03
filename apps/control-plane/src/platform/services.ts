import type { WorkerConfig } from '../config.js';
import type { Ed25519Signer } from '../crypto/ed25519.js';
import type { KubeClients } from '../k8s/client.js';
import type { createNeonServices } from '../neon/services.js';
import type { PlatformConfig, PlatformDeps } from './deps.js';
import { createSafekeeperApi } from './safekeeper-client.js';
import { createSafekeeperKube } from './safekeeper-kube.js';
import type { PlatformStore } from './store.js';

/** A step waits this long for a pod or an exclusion before it fails and the queue retries it. */
const WAIT_TIMEOUT_MS = 4 * 60_000;
const POLL_INTERVAL_MS = 5_000;

function platformConfig(config: WorkerConfig): PlatformConfig {
  return {
    safekeeperCount: config.safekeeperCount,
    neonImage: config.neonImage,
    pullSecret: config.imagePullSecret,
    entrypointConfigMap: config.safekeeperEntrypointConfigMap,
    safekeeperStorage: config.safekeeperStorage,
    migrateConcurrency: config.safekeeperMigrateConcurrency,
    rebalanceMaxMoves: config.rebalanceMaxMoves,
    rebalancePrewarm: config.rebalancePrewarm,
    waitTimeoutMs: WAIT_TIMEOUT_MS,
    pollIntervalMs: POLL_INTERVAL_MS,
  };
}

/** The platform building blocks the worker's steps and loops share, wired from configuration. */
export function createPlatformDeps(input: {
  config: WorkerConfig;
  platform: PlatformStore;
  neon: ReturnType<typeof createNeonServices>;
  kube: Pick<KubeClients, 'core' | 'apps'>;
  signer: Ed25519Signer;
}): PlatformDeps {
  return {
    platform: input.platform,
    neon: input.neon.store,
    storcon: input.neon.storcon,
    admin: input.neon.admin,
    kube: createSafekeeperKube(input.kube.apps, input.kube.core),
    safekeepers: createSafekeeperApi({ signer: input.signer }),
    config: platformConfig(input.config),
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    logger: console,
  };
}
