import { Hono } from 'hono';
import type { Ed25519Signer } from '../crypto/ed25519.js';
import {
  EndpointNotFoundError,
  type SpecService,
} from '../neon/spec-service.js';
import { SpecNotReadyError } from '../neon/spec.js';
import { StorconError } from '../neon/storcon-client.js';
import type { NeonStore } from '../neon/store.js';
import { verifyComputeSpecToken } from '../neon/tokens.js';

/**
 * `GET /compute/api/v2/computes/:computeId/spec`, called by compute_ctl as
 * `{control_plane_uri}/compute/api/v2/computes/{compute_id}/spec` with
 * `Authorization: Bearer $NEON_CONTROL_PLANE_TOKEN`
 * (compute_tools/src/spec.rs:77-79, 20-70). compute_ctl retries only 502 and 503; any
 * other status makes it give up, so "not yet" is 503 and "never" is 4xx.
 */

const error = (code: string, message: string) => ({ error: { code, message } });
const BEARER = /^Bearer\s+(.+)$/i;

interface ComputeRoutesDeps {
  store: NeonStore;
  specs: SpecService;
  signer: Ed25519Signer;
  logger?: { error(...args: unknown[]): void };
}

export function createComputeRoutes(deps: ComputeRoutesDeps): Hono {
  const app = new Hono();
  const logger = deps.logger ?? console;

  app.get('/api/v2/computes/:computeId/spec', async (c) => {
    const computeId = c.req.param('computeId');
    const token = BEARER.exec(c.req.header('authorization') ?? '')?.[1];
    const claims = token
      ? verifyComputeSpecToken(deps.signer, token.trim())
      : null;
    if (!claims) {
      return c.json(
        error('unauthorized', 'Invalid or missing compute token'),
        401,
        {
          'WWW-Authenticate': 'Bearer',
        },
      );
    }
    // A token is for one endpoint: a compromised compute cannot read another's
    // spec, which holds that project's tenant-scoped storage token.
    if (claims.endpointId !== computeId) {
      return c.json(error('forbidden', 'Token is for another compute'), 403);
    }
    const context = await deps.store.getEndpointContext(computeId);
    if (!context) return c.json(error('not_found', 'Unknown compute'), 404);
    if (context.project.tenantId !== claims.tenantId) {
      return c.json(error('forbidden', 'Token is for another tenant'), 403);
    }
    try {
      return c.json(await deps.specs.forEndpoint(computeId));
    } catch (failure) {
      if (failure instanceof EndpointNotFoundError) {
        return c.json(error('not_found', 'Unknown compute'), 404);
      }
      if (
        failure instanceof SpecNotReadyError ||
        failure instanceof StorconError
      ) {
        logger.error(`spec for ${computeId} is not ready:`, failure);
        return c.json(error('unavailable', 'Spec is not ready yet'), 503);
      }
      throw failure;
    }
  });

  return app;
}
