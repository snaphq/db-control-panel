import type { DataApiGatewayConfig } from '../config.js';
import { loadSigner } from '../crypto/ed25519.js';
import { startHttpMode } from './http.js';
import type { RunningMode } from './types.js';

/**
 * Wakes a compute and forwards `/<db>/rest/v1/*` to its PostgREST sidecar.
 * Only the health routes exist so far; the Data API task adds the proxy.
 */
export function startDataApiGateway(
  config: DataApiGatewayConfig,
): Promise<RunningMode> {
  const signer = loadSigner(config.neonJwtPrivateKeyPath);
  console.info(`data-api-gateway signing with key ${signer.keyId}`);
  return startHttpMode(config, async () => undefined);
}
