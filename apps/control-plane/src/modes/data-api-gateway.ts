import type { DataApiGatewayConfig } from '../config.js';
import { loadSigner } from '../crypto/ed25519.js';
import { createGatewayRoutes } from '../data-api/gateway.js';
import { createKubeClients } from '../k8s/client.js';
import { createNeonServices } from '../neon/services.js';
import { startHttpMode } from './http.js';
import type { RunningMode } from './types.js';

/**
 * Wakes a compute and forwards `/<db>/rest/v1/*` to its PostgREST container.
 * It shares the compute runtime with neon-glue and the worker, which is why it
 * needs the store, the storage controller (a wake builds the compute spec first)
 * and Kubernetes access. The `/healthz` and `/readyz` routes registered by the
 * base app take precedence over the catch-all gateway route.
 */
export function startDataApiGateway(
  config: DataApiGatewayConfig,
): Promise<RunningMode> {
  const signer = loadSigner(config.neonJwtPrivateKeyPath);
  console.info(`data-api-gateway signing with key ${signer.keyId}`);
  return startHttpMode(config, async ({ app, handle }) => {
    const { store, runtime } = createNeonServices({
      db: handle.db,
      kube: createKubeClients(),
      signer,
      config,
    });
    app.route(
      '/',
      createGatewayRoutes({
        store,
        runtime,
        hostSuffix: config.dataApiHostSuffix,
      }),
    );
    return undefined;
  });
}
