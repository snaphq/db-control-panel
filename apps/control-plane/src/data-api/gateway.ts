import { Hono } from 'hono';
import type { Context } from 'hono';
import { postgrestApiPort } from '../neon/compute-pod.js';
import {
  type ComputeRuntime,
  ComputeStartError,
  WakeTimeoutError,
} from '../neon/compute-runtime.js';
import { EndpointNotFoundError } from '../neon/spec-service.js';
import { SpecNotReadyError } from '../neon/spec.js';
import { StorconError } from '../neon/storcon-client.js';
import type { NeonStore } from '../neon/store.js';
import {
  corsHeaders,
  forwardableHeaders,
  isPreflight,
  parseGatewayTarget,
  preflightHeaders,
} from './gateway-routing.js';
import { waitForPort } from './tcp.js';

/**
 * The public Data API: `https://ep-<id>.apirest.alloydb.net/<db>/rest/v1/...`.
 * It finds the endpoint and database, wakes the compute through the shared
 * runtime (the same path as the Neon proxy's `wake_compute`), and streams the
 * request to that database's PostgREST container on the pod IP. Authorization
 * is PostgREST's job: the bearer token is passed through untouched and checked
 * against the project's JWKS there.
 */

export interface GatewayDeps {
  store: Pick<NeonStore, 'getEndpointContext' | 'listBranchDatabases'>;
  runtime: Pick<ComputeRuntime, 'wake'>;
  /** `apirest.alloydb.net` */
  hostSuffix: string;
  fetch?: typeof fetch;
  /** Resolves true once the sidecar accepts connections. */
  waitForPort?: (
    host: string,
    port: number,
    timeoutMs: number,
  ) => Promise<boolean>;
  /** Time PostgREST has to start answering; the body may stream for longer. */
  upstreamHeadersTimeoutMs?: number;
  sidecarStartTimeoutMs?: number;
  logger?: { error(...args: unknown[]): void };
}

const DEFAULT_HEADERS_TIMEOUT_MS = 120_000;
const DEFAULT_SIDECAR_START_TIMEOUT_MS = 15_000;
const RETRY_AFTER_SECONDS = '2';

type GatewayStatus = 400 | 404 | 502 | 503 | 504;

/** PostgREST's own error shape, so one client-side parser handles both. */
function failure(
  c: Context,
  status: GatewayStatus,
  code: string,
  message: string,
  extra: Record<string, string> = {},
) {
  return c.json({ code, message, details: null, hint: null }, status, {
    ...corsHeaders(c.req.raw.headers),
    ...extra,
  });
}

const bracket = (ip: string): string => (ip.includes(':') ? `[${ip}]` : ip);

export function createGatewayRoutes(deps: GatewayDeps): Hono {
  const app = new Hono();
  const doFetch = deps.fetch ?? fetch;
  const probe = deps.waitForPort ?? waitForPort;
  const logger = deps.logger ?? console;
  const headersTimeout =
    deps.upstreamHeadersTimeoutMs ?? DEFAULT_HEADERS_TIMEOUT_MS;
  const sidecarTimeout =
    deps.sidecarStartTimeoutMs ?? DEFAULT_SIDECAR_START_TIMEOUT_MS;

  app.all('*', async (c) => {
    const request = c.req.raw;
    const url = new URL(request.url);
    const target = parseGatewayTarget(
      c.req.header('host'),
      url.pathname,
      deps.hostSuffix,
    );
    if (target === 'host') {
      return failure(c, 404, 'endpoint_not_found', 'Unknown host');
    }
    if (target === 'path') {
      return failure(
        c,
        404,
        'not_found',
        'Use /<database>/rest/v1/<table> on the endpoint host',
      );
    }
    // A browser's preflight must not wake a compute.
    if (isPreflight(request.method, request.headers)) {
      return c.body(null, 200, preflightHeaders(request.headers));
    }

    const context = await deps.store.getEndpointContext(target.endpointId);
    if (!context) {
      return failure(c, 404, 'endpoint_not_found', 'Endpoint not found');
    }
    const database = (
      await deps.store.listBranchDatabases(context.branch.id)
    ).find((d) => d.name === target.database);
    if (!database?.dataApiEnabled || database.dataApiIndex === null) {
      return failure(
        c,
        404,
        'data_api_not_enabled',
        `The Data API is not enabled for database "${target.database}"`,
      );
    }

    let podIp: string;
    try {
      podIp = (await deps.runtime.wake(target.endpointId)).podIp;
    } catch (error) {
      if (error instanceof EndpointNotFoundError) {
        return failure(c, 404, 'endpoint_not_found', 'Endpoint not found');
      }
      const transient =
        error instanceof WakeTimeoutError ||
        error instanceof ComputeStartError ||
        error instanceof SpecNotReadyError ||
        error instanceof StorconError;
      if (!transient) throw error;
      logger.error('data api wake failed:', error);
      return failure(
        c,
        503,
        'compute_unavailable',
        'The database is starting; retry shortly',
        { 'Retry-After': RETRY_AFTER_SECONDS },
      );
    }

    const port = postgrestApiPort(database.dataApiIndex);
    if (!(await probe(podIp, port, sidecarTimeout))) {
      return failure(
        c,
        503,
        'data_api_unavailable',
        'The Data API is starting or has just been enabled; retry shortly',
        { 'Retry-After': RETRY_AFTER_SECONDS },
      );
    }

    const upstreamUrl = `http://${bracket(podIp)}:${port}${target.restPath}${url.search}`;
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), headersTimeout);
    try {
      const upstream = await doFetch(upstreamUrl, {
        method: request.method,
        // The upstream must not compress: fetch would decode the body but keep the header.
        headers: forwardableHeaders(request.headers, {
          'accept-encoding': 'identity',
        }),
        body: hasBody ? request.body : undefined,
        // Streaming a request body needs half duplex (undici).
        ...(hasBody ? { duplex: 'half' } : {}),
        redirect: 'manual',
        signal: AbortSignal.any([request.signal, timeout.signal]),
      } as RequestInit);
      clearTimeout(timer);
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: forwardableHeaders(upstream.headers),
      });
    } catch (error) {
      clearTimeout(timer);
      if (request.signal.aborted) {
        // The client went away; nobody is left to answer.
        return new Response(null, { status: 499 });
      }
      logger.error('data api upstream failed:', error);
      if (timeout.signal.aborted) {
        return failure(
          c,
          504,
          'gateway_timeout',
          'The Data API did not answer in time',
        );
      }
      return failure(
        c,
        502,
        'bad_gateway',
        'The Data API could not be reached',
      );
    }
  });

  return app;
}
