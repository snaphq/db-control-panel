import type { WorkerConfig } from '../config.js';
import { loadSigner } from '../crypto/ed25519.js';
import { connectPostgres } from '../data-api/postgres-session.js';
import { createDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { createKubeClients } from '../k8s/client.js';
import { createSqldAdminClient } from '../libsql/admin-client.js';
import { createLibsqlKube } from '../libsql/kube.js';
import { syncNodes } from '../libsql/nodes-sync.js';
import { createDrizzleLibsqlStore } from '../libsql/store-drizzle.js';
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
 * loops: idle suspend, safekeeper registration, pageserver discovery and the
 * Kubernetes node sync. The
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
    const kube = createKubeClients();
    const neon = createNeonServices({
      db: handle.db,
      kube,
      signer: neonSigner,
      config,
    });
    await startOperationWorker(boss, {
      store: createOperationStore(handle.db),
      registry: createStepRegistry({
        neon,
        libsql: {
          store: createDrizzleLibsqlStore(handle.db, null),
          admin: createSqldAdminClient({ authKey: config.libsqlAdminAuthKey }),
          kube: createLibsqlKube(kube),
          hostSuffix: config.libsqlHostSuffix,
        },
        dataApi: {
          store: neon.store,
          runtime: neon.runtime,
          secrets: neon.secrets,
          connect: connectPostgres,
        },
      }),
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
        () =>
          registerSafekeepers(
            neon.storcon,
            Array.from({ length: config.safekeeperCount }, (_, i) => i + 1),
          ),
      ),
      startLoop('pageserver discovery', config.registrationSeconds * 1000, () =>
        discoverPageservers(neon.storcon, neon.store),
      ),
      startLoop('node sync', config.registrationSeconds * 1000, () =>
        syncNodes(kube.core, neon.store),
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
