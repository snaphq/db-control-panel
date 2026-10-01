import { describe, expect, it } from 'vitest';
import { createBaseApp } from '../modes/http.js';
import { createComputeRuntime } from '../neon/compute-runtime.js';
import {
  createFakeClock,
  createFakeComputeCtl,
  createFakePods,
  createFakeStorcon,
  newTestSigner,
  seedProject,
} from '../neon/fakes.js';
import { createSpecService } from '../neon/spec-service.js';
import { StorconError } from '../neon/storcon-client.js';
import { createGatewayRoutes } from './gateway.js';

const signer = newTestSigner();

// biome-ignore lint/suspicious/noExplicitAny: the tests read arbitrary JSON bodies
const json = (response: Response): Promise<any> => response.json();
const HOST = 'ep-calm-moon-abcd1234.apirest.alloydb.net';

interface UpstreamCall {
  url: string;
  method: string;
  headers: Headers;
  body: string | null;
  duplex: unknown;
}

async function setup(
  options: {
    respond?: (
      call: UpstreamCall,
      signal: AbortSignal,
    ) => Promise<Response> | Response;
    portOpen?: boolean;
    headersTimeoutMs?: number;
  } = {},
) {
  const seeded = await seedProject();
  const { store } = seeded;
  // The seeded endpoint id is random; the gateway only needs the host to match it.
  const host = `${seeded.endpointId}.apirest.alloydb.net`;
  const database = store.databases[0];
  if (!database) throw new Error('no database');
  database.dataApiEnabled = true;
  database.dataApiIndex = 0;

  const pods = createFakePods();
  const storcon = createFakeStorcon();
  const runtime = createComputeRuntime({
    store,
    pods,
    computeCtl: createFakeComputeCtl(),
    specs: createSpecService({ store, storcon, signer }),
    signer,
    config: {
      computeImage: 'c',
      postgrestImage: 'p',
      controlPlaneUri: 'http://glue',
    },
    clock: createFakeClock(),
    timings: { wakeTimeoutMs: 30_000, pollIntervalMs: 100 },
    logger: { warn: () => {} },
  });

  const upstream: UpstreamCall[] = [];
  const probes: string[] = [];
  const errors: unknown[][] = [];
  const fakeFetch = (async (
    url: string,
    init: RequestInit & { duplex?: unknown },
  ) => {
    const body = init.body
      ? await new Response(init.body as ReadableStream | string).text()
      : null;
    const call: UpstreamCall = {
      url,
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body,
      duplex: init.duplex,
    };
    upstream.push(call);
    const respond =
      options.respond ??
      (() =>
        new Response('[{"id":1}]', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
    return respond(call, init.signal as AbortSignal);
  }) as unknown as typeof fetch;

  const app = createBaseApp(async () => {});
  app.route(
    '/',
    createGatewayRoutes({
      store,
      runtime,
      hostSuffix: 'apirest.alloydb.net',
      fetch: fakeFetch,
      waitForPort: async (h, p) => {
        probes.push(`${h}:${p}`);
        return options.portOpen ?? true;
      },
      upstreamHeadersTimeoutMs: options.headersTimeoutMs,
      logger: { error: (...a) => errors.push(a) },
    }),
  );
  const request = (
    path: string,
    init: RequestInit & { host?: string } = {},
  ) => {
    const { host: hostOverride, ...rest } = init;
    return app.request(`http://gateway.internal${path}`, {
      ...rest,
      headers: { host: hostOverride ?? host, ...(rest.headers as object) },
    });
  };
  return {
    ...seeded,
    host,
    database,
    pods,
    runtime,
    upstream,
    probes,
    errors,
    app,
    request,
  };
}

describe('forwarding', () => {
  it("wakes the compute and forwards GET to the database's sidecar port on the pod IP", async () => {
    const t = await setup();
    const response = await t.request(
      '/neondb/rest/v1/todos?select=id&order=id.desc',
      {
        headers: {
          authorization: 'Bearer jwt',
          accept: 'application/json',
          'accept-encoding': 'gzip',
        },
      },
    );
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual([{ id: 1 }]);
    expect(response.headers.get('content-type')).toBe('application/json');

    expect(t.pods.created).toEqual([`compute-${t.endpointId}`]);
    expect(t.probes).toEqual(['10.42.0.10:3000']);
    expect(t.upstream).toHaveLength(1);
    const call = t.upstream[0];
    expect(call?.url).toBe(
      'http://10.42.0.10:3000/todos?select=id&order=id.desc',
    );
    expect(call?.method).toBe('GET');
    expect(call?.headers.get('authorization')).toBe('Bearer jwt');
    expect(call?.headers.get('accept')).toBe('application/json');
    expect(call?.headers.get('accept-encoding')).toBe('identity');
    expect(call?.headers.has('host')).toBe(false);
    expect(call?.body).toBeNull();
  });

  it('reuses a running compute on the next request', async () => {
    const t = await setup();
    await t.request('/neondb/rest/v1/a');
    await t.request('/neondb/rest/v1/b');
    expect(t.pods.created).toHaveLength(1);
    expect(t.upstream.map((c) => c.url)).toEqual([
      'http://10.42.0.10:3000/a',
      'http://10.42.0.10:3000/b',
    ]);
  });

  it('sends each database to its own port', async () => {
    const t = await setup();
    t.store.databases.push({
      ...t.database,
      id: 'db_two',
      name: 'app_db',
      dataApiIndex: 7,
    });
    await t.request('/app_db/rest/v1/items');
    await t.request('/neondb/rest/v1/items');
    expect(t.upstream.map((c) => c.url)).toEqual([
      'http://10.42.0.10:3007/items',
      'http://10.42.0.10:3000/items',
    ]);
  });

  it('streams a request body through with its method and content type', async () => {
    const t = await setup({
      respond: () =>
        new Response('{"id":2}', {
          status: 201,
          headers: { location: '/todos?id=eq.2' },
        }),
    });
    const response = await t.request('/neondb/rest/v1/todos', {
      method: 'POST',
      headers: {
        authorization: 'Bearer jwt',
        'content-type': 'application/json',
        prefer: 'return=representation',
      },
      body: JSON.stringify({ title: 'write tests' }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('location')).toBe('/todos?id=eq.2');
    const call = t.upstream[0];
    expect(call?.method).toBe('POST');
    expect(call?.body).toBe('{"title":"write tests"}');
    expect(call?.duplex).toBe('half');
    expect(call?.headers.get('prefer')).toBe('return=representation');
    expect(call?.headers.get('content-type')).toBe('application/json');
  });

  it('passes PATCH and DELETE through, and the OpenAPI root', async () => {
    const t = await setup();
    await t.request('/neondb/rest/v1/todos?id=eq.1', {
      method: 'PATCH',
      body: '{}',
    });
    await t.request('/neondb/rest/v1/todos?id=eq.1', { method: 'DELETE' });
    await t.request('/neondb/rest/v1');
    expect(t.upstream.map((c) => `${c.method} ${c.url}`)).toEqual([
      'PATCH http://10.42.0.10:3000/todos?id=eq.1',
      'DELETE http://10.42.0.10:3000/todos?id=eq.1',
      'GET http://10.42.0.10:3000/',
    ]);
  });

  it("relays PostgREST's own errors with their status and body", async () => {
    const t = await setup({
      respond: () =>
        new Response(
          '{"code":"PGRST301","message":"JWT expired","details":null,"hint":null}',
          {
            status: 401,
            headers: {
              'content-type': 'application/json',
              'www-authenticate': 'Bearer error="invalid_token"',
            },
          },
        ),
    });
    const response = await t.request('/neondb/rest/v1/todos', {
      headers: { authorization: 'Bearer old' },
    });
    expect(response.status).toBe(401);
    expect((await json(response)).code).toBe('PGRST301');
    expect(response.headers.get('www-authenticate')).toContain('invalid_token');
  });

  it('does not copy hop-by-hop headers back to the client', async () => {
    const t = await setup({
      respond: () =>
        new Response('ok', {
          headers: {
            connection: 'close',
            'keep-alive': 'timeout=5',
            'content-range': '0-0/*',
          },
        }),
    });
    const response = await t.request('/neondb/rest/v1/t');
    expect(response.headers.has('keep-alive')).toBe(false);
    expect(response.headers.get('content-range')).toBe('0-0/*');
  });

  it('serves the health routes ahead of the catch-all', async () => {
    const t = await setup();
    const response = await t.app.request('http://10.0.0.5:8080/healthz');
    expect(response.status).toBe(200);
    expect(t.upstream).toHaveLength(0);
  });
});

describe('rejections', () => {
  it("answers 404 in PostgREST's error shape for unknown hosts and paths", async () => {
    const t = await setup();
    const host = await t.request('/neondb/rest/v1/t', { host: 'example.com' });
    expect(host.status).toBe(404);
    expect(await json(host)).toEqual({
      code: 'endpoint_not_found',
      message: 'Unknown host',
      details: null,
      hint: null,
    });
    const path = await t.request('/just/some/path');
    expect(path.status).toBe(404);
    expect((await json(path)).code).toBe('not_found');
    expect(t.pods.created).toEqual([]);
  });

  it('answers 404 for an endpoint that does not exist, without waking anything', async () => {
    const t = await setup();
    const response = await t.request('/neondb/rest/v1/t', {
      host: 'ep-unknown-thing-abcd1234.apirest.alloydb.net',
    });
    expect(response.status).toBe(404);
    expect((await json(response)).code).toBe('endpoint_not_found');
    expect(t.pods.created).toEqual([]);
  });

  it('answers 404 for a database without the Data API and does not wake the compute', async () => {
    const t = await setup();
    t.database.dataApiEnabled = false;
    const off = await t.request('/neondb/rest/v1/t');
    expect(off.status).toBe(404);
    expect((await json(off)).code).toBe('data_api_not_enabled');
    const missing = await t.request('/nope/rest/v1/t');
    expect(missing.status).toBe(404);
    expect(t.pods.created).toEqual([]);
    expect(t.upstream).toEqual([]);
  });

  it('does not serve an endpoint that was deleted', async () => {
    const t = await setup();
    const endpoint = t.store.endpoints.get(t.endpointId);
    if (endpoint) endpoint.deletedAt = new Date();
    expect((await t.request('/neondb/rest/v1/t')).status).toBe(404);
  });
});

describe('failures', () => {
  it('answers 503 with Retry-After while the compute cannot start', async () => {
    const t = await setup();
    t.runtime.wake = async () => {
      throw new StorconError(
        'controller unavailable',
        'GET',
        '/v1/tenant',
        503,
      );
    };
    const response = await t.request('/neondb/rest/v1/t');
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('2');
    expect((await json(response)).code).toBe('compute_unavailable');
    expect(t.errors).toHaveLength(1);
  });

  it('lets unexpected wake errors surface as an internal error', async () => {
    const t = await setup();
    t.runtime.wake = async () => {
      throw new Error('boom');
    };
    expect((await t.request('/neondb/rest/v1/t')).status).toBe(500);
  });

  it('answers 503 when the sidecar never starts accepting connections', async () => {
    const t = await setup({ portOpen: false });
    const response = await t.request('/neondb/rest/v1/t', {
      method: 'POST',
      body: '{}',
    });
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('2');
    expect((await json(response)).code).toBe('data_api_unavailable');
    expect(t.upstream).toHaveLength(0);
  });

  it('answers 502 when the upstream connection fails', async () => {
    const t = await setup({
      respond: () => {
        throw new TypeError('fetch failed');
      },
    });
    const response = await t.request('/neondb/rest/v1/t');
    expect(response.status).toBe(502);
    expect((await json(response)).code).toBe('bad_gateway');
  });

  it('answers 504 when PostgREST does not answer within the budget', async () => {
    const t = await setup({
      headersTimeoutMs: 20,
      respond: (_call, signal) =>
        new Promise<Response>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });
    const response = await t.request('/neondb/rest/v1/t');
    expect(response.status).toBe(504);
    expect((await json(response)).code).toBe('gateway_timeout');
  });
});

describe('CORS', () => {
  const origin = 'https://app.example.com';

  it('answers a preflight itself, without waking the compute', async () => {
    const t = await setup();
    const response = await t.request('/neondb/rest/v1/todos', {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,authorization',
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('access-control-allow-methods')).toContain(
      'PATCH',
    );
    expect(response.headers.get('access-control-max-age')).toBe('86400');
    expect(t.pods.created).toEqual([]);
    expect(t.upstream).toEqual([]);
  });

  it('adds CORS headers to errors the gateway itself produces', async () => {
    const t = await setup();
    t.database.dataApiEnabled = false;
    const response = await t.request('/neondb/rest/v1/t', {
      headers: { origin },
    });
    expect(response.status).toBe(404);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('access-control-expose-headers')).toContain(
      'Content-Range',
    );
  });

  it('leaves the CORS headers of proxied responses to PostgREST', async () => {
    const t = await setup({
      respond: () =>
        new Response('[]', {
          headers: { 'access-control-allow-origin': origin },
        }),
    });
    const response = await t.request('/neondb/rest/v1/t', {
      headers: { origin },
    });
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
  });
});
