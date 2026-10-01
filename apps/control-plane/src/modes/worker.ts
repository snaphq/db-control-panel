import type { WorkerConfig } from '../config.js';
import { loadSigner } from '../crypto/ed25519.js';
import { createDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { createKubeClients } from '../k8s/client.js';
import { createIdleSweeper } from '../neon/idle-suspend.js';
import { type Loop, startLoop } from '../neon/loops.js';
import {
  discoverPageservers,
  registerSafekeepers,
} from '../neon/registration.js';
import { createNeonServices } from '../neon/services.js';
import {
  createBoss,
  startOperationWorker,
  startQueue,
} from '../operations/queue.js';
import { createStepRegistry } from '../operations/registry.js';
import { createOperationStore } from '../operations/store.js';
import type { RunningMode } from './types.js';

const STOP_TIMEOUT_MS = 25_000;

/**
 * Applies migrations, then works the operations queue and runs the background
 * loops: idle suspend, safekeeper registration and pageserver discovery. The
 * worker is the only mode that migrates, so the API and glue pods never race on
 * schema changes.
 */
export async function startWorker(config: WorkerConfig): Promise<RunningMode> {
  const neonSigner = loadSigner(config.neonJwtPrivateKeyPath);
  const libsqlSigner = loadSigner(config.libsqlJwtSigningKeyPath);
  console.info(
    `worker keys: neon ${neonSigner.keyId}, libsql ${libsqlSigner.keyId}`,
  );
  const handle = createDatabase(config.databaseUrl, {
    applicationName: 'control-plane-worker',
  });
  const boss = createBoss(config.databaseUrl, 'worker');
  const loops: Loop[] = [];
  try {
    await runMigrations(handle);
    await startQueue(boss);
    const neon = createNeonServices({
      db: handle.db,
      kube: createKubeClients(),
      signer: neonSigner,
      config,
    });
    await startOperationWorker(boss, {
      store: createOperationStore(handle.db),
      registry: createStepRegistry({ neon }),
    });
    const sweeper = createIdleSweeper({
      store: neon.store,
      computeCtl: neon.computeCtl,
      runtime: neon.runtime,
    });
    loops.push(
      startLoop('idle suspend', config.idleSweepSeconds * 1000, () =>
        sweeper.sweep(),
      ),
      startLoop(
        'safekeeper registration',
        config.registrationSeconds * 1000,
        () => registerSafekeepers(neon.storcon, config.safekeeperCount),
      ),
      startLoop('pageserver discovery', config.registrationSeconds * 1000, () =>
        discoverPageservers(neon.storcon, neon.store),
      ),
    );
  } catch (error) {
    await Promise.all(loops.map((loop) => loop.stop()));
    await boss.stop({ graceful: false }).catch(() => undefined);
    await handle.close();
    throw error;
  }
  console.info('worker is processing the operations queue');
  return {
    async stop() {
      await Promise.all(loops.map((loop) => loop.stop()));
      await boss.stop({ graceful: true, timeout: STOP_TIMEOUT_MS });
      await handle.close();
    },
  };
}
