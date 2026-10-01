import {
  libsqlDatabaseResponseSchema,
  libsqlOperationResponseSchema,
  libsqlTokenResponseSchema,
  listLibsqlDatabasesResponseSchema,
} from '@repo/control-plane-contract';
import { describe, expect, it } from 'vitest';
import {
  alice,
  bob,
  buildApi,
  call,
  finishOperations,
  testLibsqlSigner,
} from './api.fixture.js';

async function setup() {
  const api = buildApi();
  for (const id of [1, 2]) {
    await api.store.upsertNode({
      id,
      name: `node-${id}`,
      tailscaleIp: `100.64.0.${id}`,
      zone: `az-${id}`,
      addRoles: ['libsql'],
    });
  }
  return api;
}

type Api = Awaited<ReturnType<typeof setup>>;

async function create(api: Api, name = 'orders', caller = alice) {
  const response = await call(api, 'POST', '/libsql/databases', {
    caller,
    body: { name },
  });
  expect(response.status).toBe(202);
  const body = libsqlOperationResponseSchema.parse(await response.json());
  finishOperations(api);
  return body;
}

const activate = (api: Api, id: string) => {
  const row = api.store.libsqlDatabases.get(id);
  if (row) row.state = 'active';
};

describe('create', () => {
  it('places the database on a libsql node and names it <db>-<team>', async () => {
    const api = await setup();
    const body = await create(api);
    expect(body.libsql_database).toMatchObject({
      name: 'orders',
      namespace: expect.stringMatching(/^orders-t[0-9a-f]{10}$/),
      state: 'creating',
      size_limit_bytes: null,
    });
    expect(body.libsql_database.hostname).toBe(
      `${body.libsql_database.namespace}.lite.alloydb.net`,
    );
    expect(body.libsql_database.url).toBe(
      `libsql://${body.libsql_database.hostname}`,
    );
    expect(body.operation).toMatchObject({
      action: 'libsql.create',
      target_type: 'libsql_database',
      target_id: body.libsql_database.id,
      status: 'scheduling',
    });
    expect([1, 2]).toContain(body.libsql_database.node_id);
  });

  it('uses the organization as the team when it is a readable label', async () => {
    const api = await setup();
    const body = await create(api, 'orders', { org: 'acme', project: 'cp-1' });
    expect(body.libsql_database.namespace).toBe('orders-acme');
  });

  it('spreads databases over nodes by free share', async () => {
    const api = await setup();
    const first = await create(api, 'one', { org: 'acme', project: 'cp-1' });
    const second = await create(api, 'two', { org: 'acme', project: 'cp-1' });
    expect(first.libsql_database.node_id).not.toBe(
      second.libsql_database.node_id,
    );
  });

  it('stores the size limit', async () => {
    const api = await setup();
    const response = await call(api, 'POST', '/libsql/databases', {
      body: { name: 'big', size_limit_bytes: 1_000_000 },
    });
    const body = libsqlOperationResponseSchema.parse(await response.json());
    expect(body.libsql_database.size_limit_bytes).toBe(1_000_000);
  });

  it('rejects an invalid name with 400', async () => {
    const api = await setup();
    for (const name of ['Bad', 'has.dot', '-x', '']) {
      const response = await call(api, 'POST', '/libsql/databases', {
        body: { name },
      });
      expect(response.status).toBe(400);
    }
  });

  it('answers 409 for a name already used in the organization', async () => {
    const api = await setup();
    await create(api);
    const again = await call(api, 'POST', '/libsql/databases', {
      caller: { org: alice.org, project: 'another-console-project' },
      body: { name: 'orders' },
    });
    expect(again.status).toBe(409);
  });

  it('lets another organization use the same database name', async () => {
    const api = await setup();
    const a = await create(api, 'orders', alice);
    const b = await create(api, 'orders', bob);
    expect(a.libsql_database.namespace).not.toBe(b.libsql_database.namespace);
  });

  it('answers 503 when no node has capacity', async () => {
    const api = buildApi();
    const response = await call(api, 'POST', '/libsql/databases', {
      body: { name: 'orders' },
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('no_capacity');
    expect(api.store.libsqlDatabases.size).toBe(0);
  });

  it('answers 423 while the console project has an operation running', async () => {
    const api = await setup();
    await call(api, 'POST', '/libsql/databases', { body: { name: 'one' } });
    const busy = await call(api, 'POST', '/libsql/databases', {
      body: { name: 'two' },
    });
    expect(busy.status).toBe(423);
  });
});

describe('reads', () => {
  it("lists and gets only the caller's databases", async () => {
    const api = await setup();
    const mine = await create(api, 'orders', alice);
    await create(api, 'orders', bob);
    const list = listLibsqlDatabasesResponseSchema.parse(
      await (await call(api, 'GET', '/libsql/databases')).json(),
    );
    expect(list.libsql_databases.map((d) => d.id)).toEqual([
      mine.libsql_database.id,
    ]);
    const one = libsqlDatabaseResponseSchema.parse(
      await (
        await call(api, 'GET', `/libsql/databases/${mine.libsql_database.id}`)
      ).json(),
    );
    expect(one.libsql_database.id).toBe(mine.libsql_database.id);
  });

  it('answers 404 for another organization or console project', async () => {
    const api = await setup();
    const mine = await create(api, 'orders', alice);
    const path = `/libsql/databases/${mine.libsql_database.id}`;
    const sameOrgOtherProject = { org: alice.org, project: 'other' };
    const otherOrgSameProject = { org: bob.org, project: alice.project };
    for (const caller of [bob, sameOrgOtherProject, otherOrgSameProject]) {
      expect((await call(api, 'GET', path, { caller })).status).toBe(404);
      expect((await call(api, 'DELETE', path, { caller })).status).toBe(404);
      expect(
        (await call(api, 'POST', `${path}/tokens`, { caller, body: {} }))
          .status,
      ).toBe(404);
      expect(
        (
          await call(api, 'POST', `${path}/fork`, {
            caller,
            body: { name: 'x' },
          })
        ).status,
      ).toBe(404);
    }
    expect((await call(api, 'GET', '/libsql/databases/ldb_none')).status).toBe(
      404,
    );
  });

  it('requires the service token and the console headers', async () => {
    const api = await setup();
    const response = await api.app.request('/v1/libsql/databases');
    expect(response.status).toBe(401);
  });
});

describe('delete', () => {
  it('marks the database deleted and queues libsql.delete', async () => {
    const api = await setup();
    const { libsql_database: db } = await create(api);
    const response = await call(api, 'DELETE', `/libsql/databases/${db.id}`);
    expect(response.status).toBe(202);
    const body = libsqlOperationResponseSchema.parse(await response.json());
    expect(body.libsql_database.state).toBe('deleting');
    expect(body.operation.action).toBe('libsql.delete');
    const record = api.store.operations.get(body.operation.id);
    expect(record?.params).toEqual({ keepBackup: false });
    expect(api.store.libsqlDatabases.get(db.id)?.deletedAt).not.toBeNull();
    finishOperations(api);
    expect((await call(api, 'GET', `/libsql/databases/${db.id}`)).status).toBe(
      404,
    );
  });

  it('can keep the backup', async () => {
    const api = await setup();
    const { libsql_database: db } = await create(api);
    const response = await call(
      api,
      'DELETE',
      `/libsql/databases/${db.id}?keep_backup=true`,
    );
    const body = libsqlOperationResponseSchema.parse(await response.json());
    expect(api.store.operations.get(body.operation.id)?.params).toEqual({
      keepBackup: true,
    });
  });
});

describe('fork', () => {
  it('copies onto the source node and passes the timestamp to the worker', async () => {
    const api = await setup();
    const { libsql_database: source } = await create(api, 'orders', {
      org: 'acme',
      project: 'cp-1',
    });
    activate(api, source.id);
    const caller = { org: 'acme', project: 'cp-1' };
    const response = await call(
      api,
      'POST',
      `/libsql/databases/${source.id}/fork`,
      {
        caller,
        body: { name: 'copy', timestamp: '2026-01-02T03:04:05Z' },
      },
    );
    expect(response.status).toBe(202);
    const body = libsqlOperationResponseSchema.parse(await response.json());
    expect(body.libsql_database).toMatchObject({
      namespace: 'copy-acme',
      node_id: source.node_id,
      state: 'creating',
    });
    expect(body.operation.action).toBe('libsql.fork');
    expect(api.store.operations.get(body.operation.id)?.params).toEqual({
      sourceNamespace: 'orders-acme',
      timestamp: '2026-01-02T03:04:05Z',
    });
  });

  it('omits the timestamp to fork the current state', async () => {
    const api = await setup();
    const { libsql_database: source } = await create(api);
    activate(api, source.id);
    const response = await call(
      api,
      'POST',
      `/libsql/databases/${source.id}/fork`,
      {
        body: { name: 'copy' },
      },
    );
    const body = libsqlOperationResponseSchema.parse(await response.json());
    expect(api.store.operations.get(body.operation.id)?.params).toEqual({
      sourceNamespace: source.namespace,
    });
  });

  it('refuses a source that is not active, a future timestamp and a taken name', async () => {
    const api = await setup();
    const { libsql_database: source } = await create(api);
    const fork = (body: unknown) =>
      call(api, 'POST', `/libsql/databases/${source.id}/fork`, { body });
    expect((await fork({ name: 'copy' })).status).toBe(409);
    activate(api, source.id);
    expect(
      (await fork({ name: 'copy', timestamp: '2999-01-01T00:00:00Z' })).status,
    ).toBe(400);
    expect((await fork({ name: 'orders' })).status).toBe(409);
    expect((await fork({ name: 'BAD' })).status).toBe(400);
  });
});

describe('tokens', () => {
  async function active() {
    const api = await setup();
    const { libsql_database: db } = await create(api);
    activate(api, db.id);
    return { api, db };
  }

  it('mints a read-write token that never expires by default', async () => {
    const { api, db } = await active();
    const response = await call(
      api,
      'POST',
      `/libsql/databases/${db.id}/tokens`,
    );
    expect(response.status).toBe(200);
    const body = libsqlTokenResponseSchema.parse(await response.json());
    expect(body.expires_at).toBeNull();
    expect(testLibsqlSigner.verify(body.token)).toMatchObject({
      p: { rw: { ns: [db.namespace] } },
    });
  });

  it('mints read-only and expiring tokens', async () => {
    const { api, db } = await active();
    const response = await call(
      api,
      'POST',
      `/libsql/databases/${db.id}/tokens`,
      {
        body: { access: 'read_only', expires_in_seconds: 600 },
      },
    );
    const body = libsqlTokenResponseSchema.parse(await response.json());
    const claims = testLibsqlSigner.verify(body.token);
    expect(claims).toMatchObject({ p: { ro: { ns: [db.namespace] } } });
    expect(claims?.exp).toBe(
      Math.floor(new Date(body.expires_at ?? '').getTime() / 1000),
    );
  });

  it('rejects bad input and databases that are not active', async () => {
    const { api, db } = await active();
    const bad = await call(api, 'POST', `/libsql/databases/${db.id}/tokens`, {
      body: { access: 'admin' },
    });
    expect(bad.status).toBe(400);
    const row = api.store.libsqlDatabases.get(db.id);
    if (row) row.state = 'creating';
    const early = await call(api, 'POST', `/libsql/databases/${db.id}/tokens`);
    expect(early.status).toBe(409);
  });
});
