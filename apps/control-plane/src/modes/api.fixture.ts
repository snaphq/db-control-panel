import { randomBytes } from 'node:crypto';
import { createSecretBox } from '../crypto/secretbox.js';
import { ACTIVE_OPERATION_STATUSES } from '../db/schema.js';
import { createMemoryLibsqlStore } from '../libsql/store-memory.js';
import type { LibsqlStore } from '../libsql/store.js';
import { newTestSigner } from '../neon/fakes.js';
import {
  type MemoryNeonStore,
  createMemoryNeonStore,
} from '../neon/store-memory.js';
import type { NeonStore, Scope } from '../neon/store.js';
import { InvalidCursorError } from '../operations/repository.js';
import type { OperationRecord } from '../operations/store.js';
import { createMemoryPlatformStore } from '../platform/store-memory.js';
import { type AdminDeps, mountApi } from './api.js';
import { createBaseApp } from './http.js';

const API_TOKEN = 'api-token';
export const ADMIN_API_TOKEN = 'admin-api-token';
export const testSecrets = createSecretBox(randomBytes(32));

// biome-ignore lint/suspicious/noExplicitAny: the tests read arbitrary JSON bodies
type Json = any;
export type TestResponse = Omit<Response, 'json'> & { json(): Promise<Json> };

export function buildApi(
  store = createMemoryNeonStore(),
  overrides: ApiOverrides = {},
) {
  const libsql = createMemoryLibsqlStore(store);
  const platform = createMemoryPlatformStore(store.operations);
  return {
    ...assembleApi(store, libsql, memoryOperationReads(store), overrides, {
      store,
      libsql,
      platform,
      safekeeperCount: 3,
      safekeeperStorage: '50Gi',
    }),
    platform,
  };
}

/** Deps a test may replace on the otherwise standard route tree. */
type ApiOverrides = Partial<{ dataApiHostSuffix: string }>;

type OperationReads = Pick<
  Parameters<typeof mountApi>[1],
  'findOperation' | 'listOperations'
>;

/** In-memory twin of `findOperation` and `listOperations` in operations/repository.ts. */
function memoryOperationReads(store: MemoryNeonStore): OperationReads {
  const visible = (record: OperationRecord, scope: Scope) =>
    record.consoleProjectId === scope.consoleProjectId &&
    (record.consoleOrgId === null || record.consoleOrgId === scope.orgId);
  return {
    async findOperation(id, scope) {
      const record = store.operations.get(id);
      return record && visible(record, scope) ? record : null;
    },
    async listOperations(scope, query) {
      const all = [...store.operations.values()]
        .filter((record) => visible(record, scope))
        .sort(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() ||
            (a.id < b.id ? 1 : -1),
        );
      let rest = all;
      if (query.cursor !== undefined) {
        const at = all.findIndex((record) => record.id === query.cursor);
        if (at < 0) throw new InvalidCursorError();
        rest = all.slice(at + 1);
      }
      const matching = rest.filter((record) =>
        query.status === undefined
          ? true
          : query.status === 'active'
            ? ACTIVE_OPERATION_STATUSES.some((s) => s === record.status)
            : record.status === query.status,
      );
      const operations = matching.slice(0, query.limit);
      return {
        operations,
        nextCursor:
          matching.length > query.limit
            ? (operations.at(-1)?.id ?? null)
            : null,
      };
    },
  };
}

/** The real route tree over any store; `findOperation` decides where operations are read from. */
export const testLibsqlSigner = newTestSigner();

export function assembleApi<S extends NeonStore>(
  store: S,
  libsql: LibsqlStore,
  operations: OperationReads,
  overrides: ApiOverrides = {},
  admin?: AdminDeps,
) {
  const app = createBaseApp(async () => {});
  mountApi(app, {
    apiToken: API_TOKEN,
    adminApiToken: ADMIN_API_TOKEN,
    pgHostSuffix: 'pg.alloydb.net',
    secrets: testSecrets,
    store,
    libsql,
    libsqlHostSuffix: 'lite.alloydb.net',
    dataApiHostSuffix: overrides.dataApiHostSuffix ?? 'apirest.alloydb.net',
    libsqlSigner: testLibsqlSigner,
    ...operations,
    admin: admin ?? {
      store,
      libsql,
      platform: createMemoryPlatformStore(),
      safekeeperCount: 3,
      safekeeperStorage: '50Gi',
    },
  });
  return { app, store };
}

export type Api = Pick<ReturnType<typeof buildApi>, 'app' | 'store'>;

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
