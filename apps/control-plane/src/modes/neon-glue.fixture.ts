import type { Hono } from 'hono';
import { newEndpointId, newNeonId } from '../crypto/ids.js';
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
import { mintComputeSpecToken } from '../neon/tokens.js';
import { createBaseApp } from './http.js';
import { createComputeRoutes } from './neon-glue-compute.js';
import { createProxyRoutes } from './neon-glue-proxy.js';
import { createStorconRoutes } from './neon-glue-storcon.js';

export const signer = newTestSigner();
export const PROXY_TOKEN = 'proxy-token';
export const CONTROL_TOKEN = 'control-plane-token';

export async function setup() {
  const seeded = await seedProject();
  const pods = createFakePods();
  const computeCtl = createFakeComputeCtl();
  const storcon = createFakeStorcon();
  const specs = createSpecService({ store: seeded.store, storcon, signer });
  const runtime = createComputeRuntime({
    store: seeded.store,
    pods,
    computeCtl,
    specs,
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
  const quiet = { error: () => {} };
  const app = createBaseApp(async () => {});
  app.route(
    '/proxy',
    createProxyRoutes({
      store: seeded.store,
      runtime,
      proxyToken: PROXY_TOKEN,
      logger: quiet,
    }),
  );
  app.route(
    '/compute',
    createComputeRoutes({ store: seeded.store, specs, signer, logger: quiet }),
  );
  app.route(
    '/storcon',
    createStorconRoutes({
      store: seeded.store,
      runtime,
      storcon,
      controlPlaneToken: CONTROL_TOKEN,
      logger: quiet,
    }),
  );
  return { ...seeded, pods, computeCtl, storcon, runtime, app, specs };
}

type App = Awaited<ReturnType<typeof setup>>['app'];

// biome-ignore lint/suspicious/noExplicitAny: the tests read arbitrary JSON bodies
type TestResponse = Omit<Response, 'json'> & { json(): Promise<any> };

const proxyHeaders = { authorization: `Bearer ${PROXY_TOKEN}` };
export const get = (
  app: App | Hono,
  path: string,
  headers: Record<string, string> = proxyHeaders,
) => app.request(path, { headers }) as Promise<TestResponse>;
export const put = (
  app: App | Hono,
  path: string,
  body: unknown,
  token = CONTROL_TOKEN,
) =>
  app.request(path, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
