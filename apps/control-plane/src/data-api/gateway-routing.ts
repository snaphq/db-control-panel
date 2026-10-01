import { isEndpointId } from '../crypto/ids.js';

/**
 * What a gateway request addresses, mirroring Neon's Data API URL:
 * `https://ep-<id>.apirest.alloydb.net/<database>/rest/v1/<postgrest path>`.
 */

export interface GatewayTarget {
  endpointId: string;
  database: string;
  /** Path PostgREST sees: `/` plus whatever follows `/rest/v1`. */
  restPath: string;
}

export type GatewayRouteError = 'host' | 'path';

const DATABASE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const REST_PREFIX = /^\/([^/]+)\/rest\/v1(\/.*)?$/;

/** The endpoint id in `ep-<id>.<suffix>[:port]`, or null for any other host. */
export function endpointFromHost(
  hostHeader: string | undefined,
  hostSuffix: string,
): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.trim().toLowerCase().replace(/:\d+$/, '');
  const tail = `.${hostSuffix.toLowerCase()}`;
  if (!host.endsWith(tail)) return null;
  const label = host.slice(0, -tail.length);
  return isEndpointId(label) ? label : null;
}

export function parseGatewayTarget(
  hostHeader: string | undefined,
  pathname: string,
  hostSuffix: string,
): GatewayTarget | GatewayRouteError {
  const endpointId = endpointFromHost(hostHeader, hostSuffix);
  if (!endpointId) return 'host';
  const match = REST_PREFIX.exec(pathname);
  if (!match?.[1]) return 'path';
  let database: string;
  try {
    database = decodeURIComponent(match[1]);
  } catch {
    return 'path';
  }
  if (!DATABASE_NAME.test(database)) return 'path';
  return { endpointId, database, restPath: match[2] ?? '/' };
}

// ---- headers

/** RFC 9110 section 7.6.1, plus `host`: the upstream request names its own. */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
]);

/** Headers to pass on, minus the hop-by-hop ones and any named by `Connection`. */
export function forwardableHeaders(
  headers: Headers,
  extra: Record<string, string> = {},
): Headers {
  const named = new Set(
    (headers.get('connection') ?? '')
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean),
  );
  const out = new Headers();
  for (const [name, value] of headers) {
    const key = name.toLowerCase();
    if (HOP_BY_HOP.has(key) || named.has(key)) continue;
    out.append(name, value);
  }
  for (const [name, value] of Object.entries(extra)) out.set(name, value);
  return out;
}

// ---- CORS, as PostgREST sets it (v16.4 src/library/PostgREST/Cors.hs, docs/references/api/cors.rst)

const ALLOWED_REQUEST_HEADERS = [
  'Authorization',
  'Content-Type',
  'Accept',
  'Accept-Language',
  'Content-Language',
];
const EXPOSED_HEADERS = [
  'Content-Encoding',
  'Content-Location',
  'Content-Range',
  'Content-Type',
  'Date',
  'Location',
  'Server',
  'Transfer-Encoding',
  'Range-Unit',
];
const CORS_MAX_AGE_SECONDS = 86_400;

/** PostgREST answers any origin when `server-cors-allowed-origins` is unset, echoing the request's. */
export function corsHeaders(request: Headers): Record<string, string> {
  const origin = request.get('origin');
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': EXPOSED_HEADERS.join(', '),
  };
}

/** A preflight is an OPTIONS request that names the method it is checking. */
export function isPreflight(method: string, request: Headers): boolean {
  return (
    method === 'OPTIONS' &&
    request.has('origin') &&
    request.has('access-control-request-method')
  );
}

export function preflightHeaders(request: Headers): Record<string, string> {
  const requested = (request.get('access-control-request-headers') ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const allowed = [...ALLOWED_REQUEST_HEADERS];
  for (const name of requested) {
    if (!allowed.some((a) => a.toLowerCase() === name.toLowerCase())) {
      allowed.push(name);
    }
  }
  const { 'Access-Control-Expose-Headers': _exposed, ...cors } =
    corsHeaders(request);
  return {
    ...cors,
    'Access-Control-Allow-Methods':
      'GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': allowed.join(', '),
    'Access-Control-Max-Age': String(CORS_MAX_AGE_SECONDS),
  };
}
