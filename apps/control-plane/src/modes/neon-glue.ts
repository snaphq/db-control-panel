import type { NeonGlueConfig } from '../config.js';
import { loadSigner } from '../crypto/ed25519.js';
import { createKubeClients } from '../k8s/client.js';
import { createNeonServices } from '../neon/services.js';
import { startHttpMode } from './http.js';
import { createComputeRoutes } from './neon-glue-compute.js';
import { createProxyRoutes } from './neon-glue-proxy.js';
import { createStorconRoutes } from './neon-glue-storcon.js';
import type { RunningMode } from './types.js';

/**
 * Serves the endpoints Neon calls: `/proxy/*` for the proxy, the compute spec
 * route for compute_ctl, and `/storcon/notify-*` for the storage controller.
 * Loading the signing key here makes a bad key path fail at startup, not at
 * first use.
 */
export function startNeonGlue(config: NeonGlueConfig): Promise<RunningMode> {
  const signer = loadSigner(config.neonJwtPrivateKeyPath);
  console.info(`neon-glue signing with key ${signer.keyId}`);
  return startHttpMode(config, async ({ app, handle }) => {
    const { store, storcon, specs, runtime } = createNeonServices({
      db: handle.db,
      kube: createKubeClients(),
      signer,
      config,
    });
    app.route(
      '/proxy',
      createProxyRoutes({ store, runtime, proxyToken: config.neonProxyToken }),
    );
    app.route('/compute', createComputeRoutes({ store, specs, signer }));
    app.route(
      '/storcon',
      createStorconRoutes({
        store,
        runtime,
        storcon,
        controlPlaneToken: config.controlPlaneJwtToken,
      }),
    );
    return undefined;
  });
}
