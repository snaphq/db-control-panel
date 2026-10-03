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
import { discoverPageservers } from '../neon/registration.js';
import { createNeonServices } from '../neon/services.js';
import {
  createBoss,
  createOperationQueue,
  startOperationWorker,
  startQueue,
} from '../operations/queue.js';
import { createStepRegistry } from '../operations/registry.js';
import { createOperationStore } from '../operations/store.js';
import { reconcileSafekeepers } from '../platform/safekeeper-manager.js';
import { createPlatformDeps } from '../platform/services.js';
import { createDrizzlePlatformStore } from '../platform/store-drizzle.js';
import type { RunningMode } from './types.js';

const STOP_TIMEOUT_MS = 25_000;
/** After a failed spread the worker waits this long before starting another by itself. */
const SPREAD_FAILURE_COOLDOWN_MS = 30 * 60_000;

/**
 * Applies migrations, then works the operations queue and runs the background
 * loops: idle suspend, the safekeeper manager (start, register, roll, spread),
 * pageserver discovery and the Kubernetes node sync. The
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
  let lastSafekeeperNote: string | null = null;
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
    const platform = createPlatformDeps({
      config,
      platform: createDrizzlePlatformStore(
        handle.db,
        createOperationQueue(boss),
      ),
      neon,
      kube,
      signer: neonSigner,
    });
    await startOperationWorker(boss, {
      store: createOperationStore(handle.db),
      registry: createStepRegistry({
        neon: { ...neon, requiredSafekeepers: config.safekeeperCount },
        platform,
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
      startLoop('safekeepers', config.registrationSeconds * 1000, async () => {
        // Fresh node data first: a node that just joined is eligible at once.
        await syncNodes(kube.core, neon.store);
        const result = await reconcileSafekeepers(platform, {
          autoSpread: config.autoSpreadSafekeepers,
          failureCooldownMs: SPREAD_FAILURE_COOLDOWN_MS,
        });
        if (result.note && result.note !== lastSafekeeperNote) {
          console.info(`safekeepers: ${result.note}`);
        }
        lastSafekeeperNote = result.note;
      }),
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
