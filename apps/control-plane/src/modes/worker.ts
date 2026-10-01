import type { WorkerConfig } from '../config.js';
import { loadSigner } from '../crypto/ed25519.js';
import { createDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { createKubeClients } from '../k8s/client.js';
import {
  createBoss,
  startOperationWorker,
  startQueue,
} from '../operations/queue.js';
import { createStepRegistry } from '../operations/steps.js';
import { createOperationStore } from '../operations/store.js';
import type { RunningMode } from './types.js';

const STOP_TIMEOUT_MS = 25_000;

/**
 * Applies migrations, then works the operations queue. The worker is the only
 * mode that migrates, so the API and glue pods never race on schema changes.
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

  try {
    await runMigrations(handle);
    await startQueue(boss);
    await startOperationWorker(boss, {
      store: createOperationStore(handle.db),
      registry: createStepRegistry({
        db: handle.db,
        kube: createKubeClients(),
        neonSigner,
        libsqlSigner,
        config,
      }),
    });
  } catch (error) {
    await boss.stop({ graceful: false }).catch(() => undefined);
    await handle.close();
    throw error;
  }
  console.info('worker is processing the operations queue');

  return {
    async stop() {
      await boss.stop({ graceful: true, timeout: STOP_TIMEOUT_MS });
      await handle.close();
    },
  };
}
