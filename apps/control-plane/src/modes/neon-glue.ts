import type { NeonGlueConfig } from '../config.js';
import { loadSigner } from '../crypto/ed25519.js';
import { startHttpMode } from './http.js';
import type { RunningMode } from './types.js';

/**
 * Serves the endpoints Neon calls (`/proxy/*`, compute specs, `/storcon/*`).
 * Only the health routes exist so far; the Neon tasks add the rest. Loading
 * the signing key here makes a bad key path fail at startup, not at first use.
 */
export function startNeonGlue(config: NeonGlueConfig): Promise<RunningMode> {
  const signer = loadSigner(config.neonJwtPrivateKeyPath);
  console.info(`neon-glue signing with key ${signer.keyId}`);
  return startHttpMode(config, async () => undefined);
}
