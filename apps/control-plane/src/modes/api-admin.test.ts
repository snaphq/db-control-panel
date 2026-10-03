import {
  adminNodesResponseSchema,
  adminSafekeepersResponseSchema,
  listPlatformOperationsResponseSchema,
  platformOperationResponseSchema,
} from '@repo/control-plane-contract';
import { describe, expect, it } from 'vitest';
import { createMemoryNeonStore } from '../neon/store-memory.js';
import {
  ADMIN_API_TOKEN,
  type TestResponse,
  alice,
  bob,
  buildApi,
  call,
  createProject,
  finishOperations,
  headersFor,
} from './api.fixture.js';

const GB = 1024 ** 3;

/** Admin calls carry the token only: no organization or project headers. */
function admin(
  api: ReturnType<typeof buildApi>,
  method: string,
  path: string,
  options: { token?: string | null; body?: unknown } = {},
): Promise<TestResponse> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  const token = options.token === undefined ? ADMIN_API_TOKEN : options.token;
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return api.app.request(`/v1/admin${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }) as Promise<TestResponse>;
}

async function seedCluster(api: ReturnType<typeof buildApi>) {
  await api.store.upsertNode({
    id: 1,
    name: 'hel-1',
    tailscaleIp: '100.64.0.1',
    zone: 'az-1',
    addRoles: [],
    roles: ['pageserver', 'libsql', 'compute'],
    registeredPageserver: true,
    capacity: {
      ready: true,
      missing: false,
      hostname: 'hel-1',
      allocatable: {
        cpuMillis: 8000,
        memoryBytes: 16 * GB,
        storageBytes: 400 * GB,
      },
      labels: { 'alloydb.net/node-id': '1', 'alloydb.net/pageserver': 'true' },
      pageserver: {
        availability: 'Active',
        scheduling: 'Active',
        attachedShards: 7,
        observedAt: '2026-10-03T10:00:00.000Z',
      },
    },
  });
  await api.store.upsertNode({
    id: 2,
    name: 'hel-2',
    tailscaleIp: '100.64.0.2',
    zone: 'az-2',
    addRoles: [],
    roles: ['pageserver'],
    capacity: {
      ready: true,
      missing: false,
      allocatable: { storageBytes: 400 * GB },
    },
  });
  for (const nodeId of [1, 1, 1]) {
    const row = await api.platform.createSafekeeper({
      nodeId,
      nodeName: 'hel-1',
      operationId: null,
    });
    await api.platform.setSafekeeperState(row.id, 'active');
  }
}

describe('admin authentication', () => {
  const routes: [string, string][] = [
    ['GET', '/nodes'],
    ['GET', '/safekeepers'],
    ['GET', '/operations?scope=platform'],
    ['GET', '/operations/op_x'],
    ['POST', '/pageservers/rebalance'],
    ['POST', '/safekeepers/spread'],
    ['GET', '/nothing-here'],
  ];

  it.each(routes)('%s %s needs the bearer token', async (method, path) => {
    const api = buildApi();
    const missing = await admin(api, method, path, { token: null });
    expect(missing.status).toBe(401);
    expect(missing.headers.get('www-authenticate')).toBe('Bearer');
    expect((await admin(api, method, path, { token: 'wrong' })).status).toBe(
      401,
    );
  });

  it.each(routes)('%s %s refuses the console token', async (method, path) => {
    const api = buildApi();
    const response = await admin(api, method, path, { token: 'api-token' });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('unauthorized');
  });

  it('does not let the console token start a platform operation', async () => {
    const api = buildApi();
    await admin(api, 'POST', '/pageservers/rebalance', {
      token: 'api-token',
    });
    expect(api.platform.operations.size).toBe(0);
  });

  it('does not let the admin token reach an org-scoped route', async () => {
    const api = buildApi();
    for (const path of ['/projects', '/operations/nothing']) {
      const response = (await api.app.request(`/v1${path}`, {
        headers: {
          authorization: `Bearer ${ADMIN_API_TOKEN}`,
          'x-alloydb-org': alice.org,
          'x-alloydb-project': alice.project,
        },
      })) as TestResponse;
      expect(response.status).toBe(401);
    }
  });

  it('does not need the organization and project headers the console routes need', async () => {
    const api = buildApi();
    expect((await admin(api, 'GET', '/nodes')).status).toBe(200);
    // The console token without headers is refused on a console route.
    const console = await api.app.request('/v1/projects', {
      headers: { authorization: 'Bearer api-token' },
    });
    expect(console.status).toBe(400);
  });

  it('answers an unknown admin path with 404, not a complaint about headers', async () => {
    const api = buildApi();
    const response = await admin(api, 'GET', '/nothing-here');
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('not_found');
  });
});

describe('GET /v1/admin/nodes', () => {
  it('lists nodes with labels, capacity, pageserver state, safekeepers and libSQL counts', async () => {
    const api = buildApi();
    await seedCluster(api);
    const body = await (await admin(api, 'GET', '/nodes')).json();
    expect(body.nodes).toHaveLength(2);
    expect(body.nodes[0]).toMatchObject({
      id: 1,
      name: 'hel-1',
      hostname: 'hel-1',
      zone: 'az-1',
      tailscale_ip: '100.64.0.1',
      roles: ['pageserver', 'libsql', 'compute'],
      ready: true,
      missing: false,
      labels: { 'alloydb.net/pageserver': 'true' },
      allocatable: {
        cpu_millis: 8000,
        memory_bytes: 16 * GB,
        storage_bytes: 400 * GB,
      },
      pageserver: {
        registered: true,
        availability: 'Active',
        scheduling: 'Active',
        attached_shards: 7,
        observed_at: '2026-10-03T10:00:00.000Z',
      },
      safekeepers: [
        { id: 1, state: 'active' },
        { id: 2, state: 'active' },
        { id: 3, state: 'active' },
      ],
      libsql_databases: 0,
    });
    // A pageserver the worker has not looked at yet, and no safekeepers there.
    expect(body.nodes[1]).toMatchObject({
      id: 2,
      hostname: 'hel-2',
      pageserver: {
        registered: false,
        availability: null,
        attached_shards: null,
      },
      safekeepers: [],
      allocatable: { cpu_millis: null },
    });
  });

  it('counts the libSQL databases on each node and hides retired safekeepers', async () => {
    const api = buildApi();
    await seedCluster(api);
    await api.platform.setSafekeeperState(3, 'retired');
    api.store.libsqlDatabases.set('ldb_1', {
      id: 'ldb_1',
      consoleProjectId: 'cp',
      consoleOrgId: 'org',
      name: 'a',
      namespace: 'a-org',
      nodeId: 1,
      state: 'active',
      sizeLimitBytes: null,
      createdAt: new Date(),
      deletedAt: null,
    });
    const body = await (await admin(api, 'GET', '/nodes')).json();
    expect(body.nodes[0].libsql_databases).toBe(1);
    expect(body.nodes[0].safekeepers.map((s: { id: number }) => s.id)).toEqual([
      1, 2,
    ]);
  });

  it('shows a node that left the cluster as missing', async () => {
    const api = buildApi();
    await api.store.upsertNode({
      id: 9,
      name: 'gone',
      tailscaleIp: '100.64.0.9',
      zone: 'az-9',
      addRoles: [],
      capacity: { ready: false, missing: true },
    });
    const body = await (await admin(api, 'GET', '/nodes')).json();
    expect(body.nodes[0]).toMatchObject({ ready: false, missing: true });
  });
});

describe('GET /v1/admin/safekeepers', () => {
  it('lists the safekeepers and what the layout policy would do next', async () => {
    const api = buildApi();
    await seedCluster(api);
    const body = await (await admin(api, 'GET', '/safekeepers')).json();
    expect(body.safekeepers.map((s: { id: number }) => s.id)).toEqual([
      1, 2, 3,
    ]);
    expect(body.safekeepers[0]).toMatchObject({
      id: 1,
      node_id: 1,
      node_name: 'hel-1',
      availability_zone: 'az-1',
      hostname: 'safekeeper-1.neon.svc.cluster.local',
      state: 'active',
      operation_id: null,
      drain: null,
      retired_at: null,
    });
    // Two eligible nodes, all three safekeepers on one: the next spread moves safekeeper 3.
    expect(body.layout).toEqual({
      desired_count: 3,
      target_per_node: { 1: 2, 2: 1 },
      create_on_nodes: [],
      next_move: { remove_safekeeper: 3, from_node_id: 1, to_node_id: 2 },
      stranded: [],
      blocked: null,
    });
  });

  it('shows the drain progress of a retiring safekeeper', async () => {
    const api = buildApi();
    await seedCluster(api);
    await api.platform.setSafekeeperState(3, 'retiring');
    await api.platform.setSafekeeperDrain(3, {
      total: 4,
      migrated: 1,
      failed: [{ timeline: 't/tl', reason: 'conflict' }],
      updatedAt: '2026-10-03T10:00:00.000Z',
    });
    const body = await (await admin(api, 'GET', '/safekeepers')).json();
    expect(body.safekeepers[2]).toMatchObject({
      state: 'retiring',
      drain: {
        total: 4,
        migrated: 1,
        failed: [{ timeline: 't/tl', reason: 'conflict' }],
        updated_at: '2026-10-03T10:00:00.000Z',
      },
    });
  });

  it('reports a cluster with nowhere to put a safekeeper', async () => {
    const api = buildApi(createMemoryNeonStore());
    const body = await (await admin(api, 'GET', '/safekeepers')).json();
    expect(body.safekeepers).toEqual([]);
    expect(body.layout.blocked).toMatch(/no eligible node/);
  });
});

describe('starting platform operations', () => {
  it.each([
    ['/pageservers/rebalance', 'pageservers.rebalance'],
    ['/safekeepers/spread', 'safekeepers.spread'],
  ])('POST %s answers 202 with the operation', async (path, action) => {
    const api = buildApi();
    const response = await admin(api, 'POST', path);
    expect(response.status).toBe(202);
    const { operation } = await response.json();
    expect(operation).toMatchObject({
      action,
      status: 'scheduling',
      failures_count: 0,
      error: null,
      params: { reason: 'manual' },
      progress: { completed_steps: [], outputs: {} },
      finished_at: null,
    });
    const fetched = await (
      await admin(api, 'GET', `/operations/${operation.id}`)
    ).json();
    expect(fetched.operation.id).toBe(operation.id);
  });

  it('runs one at a time: a second start, of either kind, is 409 platform_busy', async () => {
    const api = buildApi();
    const first = await (
      await admin(api, 'POST', '/pageservers/rebalance')
    ).json();
    for (const path of ['/pageservers/rebalance', '/safekeepers/spread']) {
      const second = await admin(api, 'POST', path);
      expect(second.status).toBe(409);
      const body = await second.json();
      expect(body.error.code).toBe('platform_busy');
      expect(body.error.message).toContain(first.operation.id);
    }
    finishOperations(api);
    expect((await admin(api, 'POST', '/safekeepers/spread')).status).toBe(202);
  });

  it('neither takes a project lock nor waits for one', async () => {
    const api = buildApi();
    const project = await createProject(api);
    const start = `/projects/${project.projectId}/endpoints/${project.endpointId}/start`;
    const suspend = `/projects/${project.projectId}/endpoints/${project.endpointId}/suspend`;

    // The project has an operation in flight: it is locked (423) for further mutations...
    expect((await call(api, 'POST', start)).status).toBe(202);
    expect((await call(api, 'POST', suspend)).status).toBe(423);
    // ...which does not stop a platform operation.
    expect((await admin(api, 'POST', '/pageservers/rebalance')).status).toBe(
      202,
    );

    // And the platform operation locks nobody else: another project is created meanwhile.
    expect(
      (
        await call(api, 'POST', '/projects', {
          caller: bob,
          body: { name: 'other' },
        })
      ).status,
    ).toBe(202);
    // The first project is still locked by its own operation, not by the platform one.
    expect((await call(api, 'POST', suspend)).status).toBe(423);
  });

  it('keeps platform operations out of the console API', async () => {
    const api = buildApi();
    const { operation } = await (
      await admin(api, 'POST', '/pageservers/rebalance')
    ).json();
    expect((await call(api, 'GET', `/operations/${operation.id}`)).status).toBe(
      404,
    );
    const listed = await (
      await call(api, 'GET', '/operations', { caller: alice })
    ).json();
    expect(listed.operations).toEqual([]);
  });
});

describe('GET /v1/admin/operations', () => {
  async function seedOperations(api: ReturnType<typeof buildApi>) {
    const ids: string[] = [];
    for (const path of [
      '/pageservers/rebalance',
      '/safekeepers/spread',
      '/pageservers/rebalance',
    ]) {
      const { operation } = await (await admin(api, 'POST', path)).json();
      ids.push(operation.id);
      finishOperations(api);
    }
    return ids;
  }

  it('lists platform operations newest first, and pages through them', async () => {
    const api = buildApi();
    const ids = await seedOperations(api);
    const first = await (
      await admin(api, 'GET', '/operations?scope=platform&limit=2')
    ).json();
    expect(first.operations).toHaveLength(2);
    expect(first.next_cursor).toBe(first.operations[1].id);
    const rest = await (
      await admin(
        api,
        'GET',
        `/operations?scope=platform&limit=2&cursor=${first.next_cursor}`,
      )
    ).json();
    expect(rest.operations).toHaveLength(1);
    expect(rest.next_cursor).toBeNull();
    expect(
      [...first.operations, ...rest.operations]
        .map((o: { id: string }) => o.id)
        .sort(),
    ).toEqual([...ids].sort());
  });

  it('filters by status', async () => {
    const api = buildApi();
    await seedOperations(api);
    await admin(api, 'POST', '/safekeepers/spread');
    const active = await (
      await admin(api, 'GET', '/operations?scope=platform&status=active')
    ).json();
    expect(active.operations).toHaveLength(1);
    expect(active.operations[0]).toMatchObject({
      action: 'safekeepers.spread',
      status: 'scheduling',
    });
    const finished = await (
      await admin(api, 'GET', '/operations?scope=platform&status=finished')
    ).json();
    expect(finished.operations).toHaveLength(3);
  });

  it('shows step progress of a running operation', async () => {
    const api = buildApi();
    const { operation } = await (
      await admin(api, 'POST', '/safekeepers/spread')
    ).json();
    const record = api.store.operations.get(operation.id);
    if (record) {
      record.status = 'running';
      record.progress = {
        completedSteps: ['platform.spread.plan'],
        outputs: {
          'platform.spread.plan': { move: null },
          'platform.spread.migrate': { migrated: 2 },
        },
      };
    }
    const fetched = await (
      await admin(api, 'GET', `/operations/${operation.id}`)
    ).json();
    expect(fetched.operation.progress).toEqual({
      completed_steps: ['platform.spread.plan'],
      outputs: {
        'platform.spread.plan': { move: null },
        'platform.spread.migrate': { migrated: 2 },
      },
    });
  });

  it('rejects other scopes, bad statuses, limits and cursors', async () => {
    const api = buildApi();
    for (const query of [
      'scope=everything',
      'scope=platform&status=sleeping',
      'scope=platform&limit=0',
      'scope=platform&limit=101',
      'scope=platform&cursor=op_missing',
    ]) {
      const response = await admin(api, 'GET', `/operations?${query}`);
      expect(response.status, query).toBe(400);
      expect((await response.json()).error.code).toBe('bad_request');
    }
  });

  it('answers 404 for an unknown operation', async () => {
    const api = buildApi();
    expect((await admin(api, 'GET', '/operations/op_nope')).status).toBe(404);
  });
});

describe('responses match the contract', () => {
  it('validates every admin response with the shared schemas', async () => {
    const api = buildApi();
    await seedCluster(api);
    const started = await admin(api, 'POST', '/safekeepers/spread');
    const operation = (await started.json()).operation.id;
    expect(
      adminNodesResponseSchema.safeParse(
        await (await admin(api, 'GET', '/nodes')).json(),
      ).success,
    ).toBe(true);
    expect(
      adminSafekeepersResponseSchema.safeParse(
        await (await admin(api, 'GET', '/safekeepers')).json(),
      ).success,
    ).toBe(true);
    expect(
      listPlatformOperationsResponseSchema.safeParse(
        await (await admin(api, 'GET', '/operations?scope=platform')).json(),
      ).success,
    ).toBe(true);
    expect(
      platformOperationResponseSchema.safeParse(
        await (await admin(api, 'GET', `/operations/${operation}`)).json(),
      ).success,
    ).toBe(true);
  });
});

describe('the console headers still protect the console routes', () => {
  it('rejects a console call without headers, with or without the admin routes mounted', async () => {
    const api = buildApi();
    const headers = { ...headersFor(alice) } as Record<string, string>;
    headers['x-alloydb-org'] = '';
    const response = await api.app.request('/v1/projects', { headers });
    expect(response.status).toBe(400);
  });
});
