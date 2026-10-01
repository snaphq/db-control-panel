import { Hono } from 'hono';
import type { Context } from 'hono';
import { isEndpointId } from '../crypto/ids.js';
import {
  type ComputeRuntime,
  ComputeStartError,
  WakeTimeoutError,
} from '../neon/compute-runtime.js';
import { EndpointNotFoundError } from '../neon/spec-service.js';
import { SpecNotReadyError } from '../neon/spec.js';
import { StorconError } from '../neon/storcon-client.js';
import type { NeonStore } from '../neon/store.js';
import { bearerAuth } from './auth.js';

/**
 * Routes the Neon proxy calls (`--auth-endpoint http://neon-glue:8080/proxy`).
 * It appends `get_endpoint_access_control`, `wake_compute` and
 * `endpoints/<id>/jwks` to that URL and sends `Authorization: Bearer` with
 * `NEON_PROXY_TO_CONTROLPLANE_TOKEN` (proxy/src/control_plane/client/cplane_proxy_v1.rs:140-142,
 * 230-233, 282-286).
 */

/** Compute Postgres and PgBouncer ports in the pod (docs-internal/platform/architecture.mdx). */
const POSTGRES_PORT = 5432;
const PGBOUNCER_PORT = 6432;
const POOLER_SUFFIX = '-pooler';

/** Reasons from proxy/src/control_plane/messages.rs:113-232 that this service answers with. */
type ProxyReason =
  | 'ENDPOINT_NOT_FOUND'
  | 'PROJECT_UNDER_MAINTENANCE'
  | 'UNKNOWN';

/**
 * The error body the proxy parses (`ControlPlaneErrorMessage`, messages.rs:16-22):
 * `error` is required and the optional `status.details` carries the reason that
 * decides whether the proxy retries. `retry_info.retry_delay_ms` marks an error
 * as retryable and is also how long the proxy caches it (cplane_proxy_v1.rs:109-113).
 */
function proxyErrorBody(
  reason: ProxyReason,
  message: string,
  options: { retryDelayMs?: number } = {},
) {
  return {
    error: message,
    status: {
      code: reason,
      message,
      details: {
        error_info: { reason },
        ...(options.retryDelayMs === undefined
          ? {}
          : { retry_info: { retry_delay_ms: options.retryDelayMs } }),
      },
    },
  };
}

const notFound = (c: Context) =>
  c.json(proxyErrorBody('ENDPOINT_NOT_FOUND', 'endpoint not found'), 404);

/** `ep-…-pooler` names the same endpoint as `ep-…`; the suffix selects PgBouncer. */
function parseEndpointish(
  raw: string | undefined,
): { endpointId: string; pooler: boolean } | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  const pooler = value.endsWith(POOLER_SUFFIX);
  const endpointId = pooler ? value.slice(0, -POOLER_SUFFIX.length) : value;
  return isEndpointId(endpointId) ? { endpointId, pooler } : null;
}

export interface ProxyRoutesDeps {
  store: NeonStore;
  runtime: ComputeRuntime;
  /** `NEON_PROXY_TO_CONTROLPLANE_TOKEN` */
  proxyToken: string;
  logger?: { error(...args: unknown[]): void };
}

/** HTTP answer for a wake that failed; transient failures carry a retry delay so the proxy tries again. */
function wakeFailure(
  c: Context,
  error: unknown,
  logger: { error(...a: unknown[]): void },
) {
  if (error instanceof EndpointNotFoundError) return notFound(c);
  const transient =
    error instanceof WakeTimeoutError ||
    error instanceof ComputeStartError ||
    error instanceof SpecNotReadyError ||
    error instanceof StorconError;
  if (!transient) throw error;
  logger.error('wake_compute failed:', error);
  return c.json(
    proxyErrorBody('UNKNOWN', 'compute is not available yet', {
      retryDelayMs: 2_000,
    }),
    503,
  );
}

export function createProxyRoutes(deps: ProxyRoutesDeps): Hono {
  const app = new Hono();
  const logger = deps.logger ?? console;
  app.use('*', bearerAuth(deps.proxyToken));

  app.get('/get_endpoint_access_control', async (c) => {
    const target = parseEndpointish(c.req.query('endpointish'));
    const context =
      target && (await deps.store.getEndpointContext(target.endpointId));
    if (!context) return notFound(c);
    const roleName = c.req.query('role') ?? '';
    const roles = await deps.store.listBranchRoles(context.branch.id);
    const role = roles.find((r) => r.name === roleName);
    const { project } = context;
    // GetEndpointAccessControl (messages.rs:253-268). An empty `role_secret`
    // is how the proxy learns the role does not exist; it then fails the
    // login with an ordinary authentication error.
    return c.json({
      role_secret: role?.scramSecret ?? '',
      project_id: project.id,
      account_id: project.consoleOrgId,
      ...(project.allowedIps ? { allowed_ips: project.allowedIps } : {}),
    });
  });

  app.get('/wake_compute', async (c) => {
    const target = parseEndpointish(c.req.query('endpointish'));
    if (!target) return notFound(c);
    try {
      const woken = await deps.runtime.wake(target.endpointId);
      const context = await deps.store.getEndpointContext(target.endpointId);
      if (!context) return notFound(c);
      const port = target.pooler ? PGBOUNCER_PORT : POSTGRES_PORT;
      const host = woken.podIp.includes(':') ? `[${woken.podIp}]` : woken.podIp;
      // WakeCompute and MetricsAuxInfo (messages.rs:289-293, 361-368). No
      // `server_name`, so the proxy talks to the pod without TLS. `cold_start_info`
      // only takes unknown, warm, pool_hit and pool_miss from a control plane.
      return c.json({
        address: `${host}:${port}`,
        aux: {
          endpoint_id: target.endpointId,
          project_id: context.project.id,
          branch_id: context.branch.id,
          compute_id: target.endpointId,
          cold_start_info: woken.coldStart ? 'pool_miss' : 'warm',
        },
      });
    } catch (error) {
      return wakeFailure(c, error, logger);
    }
  });

  // EndpointJwksResponse (messages.rs:409-420). JWT login to Postgres is not
  // offered, so every endpoint has an empty rule set.
  app.get('/endpoints/:endpointId/jwks', async (c) => {
    const target = parseEndpointish(c.req.param('endpointId'));
    const context =
      target && (await deps.store.getEndpointContext(target.endpointId));
    if (!context) return notFound(c);
    return c.json({ jwks: [] });
  });

  return app;
}
