import type { NeonGlueConfig, WorkerConfig } from '../config.js';
import type { Ed25519Signer } from '../crypto/ed25519.js';
import type { Database } from '../db/client.js';
import type { KubeClients } from '../k8s/client.js';
import { createPodApi } from '../k8s/pods.js';
import type { OperationQueue } from '../operations/queue.js';
import { createComputeCtlClient } from './compute-ctl-client.js';
import { createComputeRuntime } from './compute-runtime.js';
import { createSpecService } from './spec-service.js';
import { createStorconClient } from './storcon-client.js';
import { createDrizzleNeonStore } from './store-drizzle.js';

/** The Neon building blocks the worker and neon-glue share, wired from configuration. */
export function createNeonServices(input: {
  db: Database;
  kube: Pick<KubeClients, 'core'>;
  signer: Ed25519Signer;
  config: Pick<
    WorkerConfig | NeonGlueConfig,
    | 'storageControllerUrl'
    | 'controlPlaneJwtToken'
    | 'computeImage'
    | 'postgrestImage'
    | 'imagePullSecret'
    | 'neonGlueUrl'
  >;
  queue?: OperationQueue;
}) {
  const { db, kube, signer, config } = input;
  const store = createDrizzleNeonStore(db, input.queue ?? null);
  const storcon = createStorconClient({
    baseUrl: config.storageControllerUrl,
    token: config.controlPlaneJwtToken,
  });
  const specs = createSpecService({ store, storcon, signer });
  const computeCtl = createComputeCtlClient({ signer });
  const runtime = createComputeRuntime({
    store,
    pods: createPodApi(kube.core),
    computeCtl,
    specs,
    signer,
    config: {
      computeImage: config.computeImage,
      postgrestImage: config.postgrestImage,
      controlPlaneUri: config.neonGlueUrl,
      pullSecret: config.imagePullSecret,
    },
  });
  return { store, storcon, specs, computeCtl, runtime };
}
