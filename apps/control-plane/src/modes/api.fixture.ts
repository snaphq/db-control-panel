import { randomBytes } from 'node:crypto';
import { createSecretBox } from '../crypto/secretbox.js';
import { createMemoryLibsqlStore } from '../libsql/store-memory.js';
import type { LibsqlStore } from '../libsql/store.js';
import { newTestSigner } from '../neon/fakes.js';
import { createMemoryNeonStore } from '../neon/store-memory.js';
import type { NeonStore } from '../neon/store.js';
import { createApiRoutes } from './api.js';
import { createBaseApp } from './http.js';

const API_TOKEN = 'api-token';
export const testSecrets = createSecretBox(randomBytes(32));

// biome-ignore lint/suspicious/noExplicitAny: the tests read arbitrary JSON bodies
type Json = any;
export type TestResponse = Omit<Response, 'json'> & { json(): Promise<Json> };

export function buildApi(
  store = createMemoryNeonStore(),
  overrides: ApiOverrides = {},
) {
  return assembleApi(
    store,
    createMemoryLibsqlStore(store),
    async (id, scope) => {
      const record = store.operations.get(id);
      return record &&
        record.consoleProjectId === scope.consoleProjectId &&
        (record.consoleOrgId === null || record.consoleOrgId === scope.orgId)
        ? record
        : null;
    },
    overrides,
  );
}

/** Deps a test may replace on the otherwise standard route tree. */
type ApiOverrides = Partial<{ dataApiHostSuffix: string }>;

/** The real route tree over any store; `findOperation` decides where operations are read from. */
export const testLibsqlSigner = newTestSigner();

export function assembleApi<S extends NeonStore>(
  store: S,
  libsql: LibsqlStore,
  findOperation: Parameters<typeof createApiRoutes>[0]['findOperation'],
  overrides: ApiOverrides = {},
) {
  const app = createBaseApp(async () => {});
  app.route(
    '/v1',
    createApiRoutes({
      apiToken: API_TOKEN,
      pgHostSuffix: 'pg.alloydb.net',
      secrets: testSecrets,
      store,
      libsql,
      libsqlHostSuffix: 'lite.alloydb.net',
      dataApiHostSuffix: overrides.dataApiHostSuffix ?? 'apirest.alloydb.net',
      libsqlSigner: testLibsqlSigner,
      findOperation,
    }),
  );
  return { app, store };
}

export type Api = ReturnType<typeof buildApi>;

export interface Caller {
  org: string;
  project: string;
}

export const alice: Caller = { org: 'org_a', project: 'console-a' };
export const bob: Caller = { org: 'org_b', project: 'console-b' };

export const headersFor = (caller: Caller) => ({
  authorization: `Bearer ${API_TOKEN}`,
  'x-alloydb-org': caller.org,
  'x-alloydb-project': caller.project,
  'content-type': 'application/json',
});

export function call(
  api: Api,
  method: string,
  path: string,
  options: { caller?: Caller; body?: unknown } = {},
): Promise<TestResponse> {
  return api.app.request(`/v1${path}`, {
    method,
    headers: headersFor(options.caller ?? alice),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }) as Promise<TestResponse>;
}

/** Settles every operation, the way the worker would, so the next mutation is accepted. */
export function finishOperations(api: Api): void {
  for (const record of api.store.operations.values()) {
    if (record.status === 'scheduling' || record.status === 'running') {
      record.status = 'finished';
    }
  }
}

/** Creates a project for `caller` and settles its operation. */
export async function createProject(
  api: Api,
  caller: Caller = alice,
  name = 'demo',
) {
  const response = await call(api, 'POST', '/projects', {
    caller,
    body: { name },
  });
  if (response.status !== 202) {
    throw new Error(`project create answered ${response.status}`);
  }
  const body = await response.json();
  finishOperations(api);
  return {
    body,
    projectId: body.project.id as string,
    branchId: body.branch.id as string,
    endpointId: body.endpoints[0].id as string,
    password: body.roles[0].password as string,
  };
}
