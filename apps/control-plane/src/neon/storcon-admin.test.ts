import { describe, expect, it, vi } from 'vitest';
import { createStorconAdminClient } from './storcon-admin.js';
import { StorconError } from './storcon-http.js';

interface Call {
  url: string;
  method: string;
  body: unknown;
}

function setup(responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const queue = [...responses];
  const fakeFetch = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      const next = queue.shift();
      if (!next) throw new Error('unexpected request');
      if (next instanceof Error) throw next;
      return next;
    },
  ) as unknown as typeof fetch;
  const client = createStorconAdminClient({
    baseUrl: 'http://storcon.test:1234',
    token: 'admin-jwt',
    fetch: fakeFetch,
    sleep: async () => {},
    retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
  });
  return { client, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const msg = (status: number, text: string) => json({ msg: text }, status);
const tenant = 'a'.repeat(32);
const timeline = 'b'.repeat(32);

const shard = (overrides: Record<string, unknown> = {}) => ({
  tenant_shard_id: tenant,
  node_attached: 1,
  node_secondary: [],
  last_error: '',
  is_reconciling: false,
  is_pending_compute_notification: false,
  is_splitting: false,
  is_importing: false,
  scheduling_policy: 'Active',
  preferred_az_id: 'az-1',
  ...overrides,
});
const describeBody = (shards = [shard()]) => ({
  tenant_id: tenant,
  shards,
  stripe_size: 2048,
  policy: { Attached: 0 },
  config: {},
});

describe('listTenants and describeTenant', () => {
  it('lists every tenant from /control/v1/tenant', async () => {
    const { client, calls } = setup([json([describeBody()])]);
    const tenants = await client.listTenants();
    expect(calls[0]).toMatchObject({
      method: 'GET',
      url: 'http://storcon.test:1234/control/v1/tenant',
    });
    expect(tenants[0]?.shards[0]).toMatchObject({
      node_attached: 1,
      preferred_az_id: 'az-1',
    });
  });

  it('describes one tenant, and answers null for an unknown one', async () => {
    const { client, calls } = setup([
      json(describeBody()),
      msg(404, 'Tenant not found'),
    ]);
    expect((await client.describeTenant(tenant))?.tenant_id).toBe(tenant);
    expect(calls[0]?.url).toContain(`/control/v1/tenant/${tenant}`);
    expect(await client.describeTenant(tenant)).toBeNull();
  });

  it('rejects a body that is not a tenant description', async () => {
    const { client } = setup([json([{ tenant_id: tenant }])]);
    await expect(client.listTenants()).rejects.toBeInstanceOf(StorconError);
  });
});

describe('migrateShard', () => {
  const input = {
    shardId: tenant,
    nodeId: 2,
    originNodeId: 1,
    prewarm: false,
  };

  it('sends the destination, the origin and the migration config', async () => {
    const { client, calls } = setup([json({})]);
    expect(await client.migrateShard(input)).toBe('done');
    expect(calls[0]).toEqual({
      method: 'PUT',
      url: `http://storcon.test:1234/control/v1/tenant/${tenant}/migrate`,
      body: {
        node_id: 2,
        origin_node_id: 1,
        migration_config: { prewarm: false },
      },
    });
  });

  it('reports 408, the controller still reconciling, as pending', async () => {
    const { client } = setup([msg(408, 'Timeout')]);
    expect(await client.migrateShard(input)).toBe('pending');
  });

  it('throws a refusal with its status', async () => {
    const { client } = setup([msg(412, 'Migration to a worse-scoring node')]);
    const error = await client.migrateShard(input).catch((e) => e);
    expect(error).toBeInstanceOf(StorconError);
    expect(error.status).toBe(412);
    expect(error.message).toContain('worse-scoring');
  });

  it('retries a controller that is still starting', async () => {
    const { client, calls } = setup([msg(503, 'starting'), json({})]);
    expect(await client.migrateShard(input)).toBe('done');
    expect(calls).toHaveLength(2);
  });
});

describe('setPreferredAzs', () => {
  it('sends the map as the body and returns the updated shards', async () => {
    const { client, calls } = setup([json({ updated: [tenant] })]);
    expect(await client.setPreferredAzs({ [tenant]: 'az-2' })).toEqual([
      tenant,
    ]);
    expect(calls[0]).toMatchObject({
      method: 'PUT',
      url: 'http://storcon.test:1234/control/v1/preferred_azs',
      body: { [tenant]: 'az-2' },
    });
  });
});

describe('timeline membership', () => {
  it('locates a timeline and answers null when the controller does not manage it', async () => {
    const { client, calls } = setup([
      json({ generation: 3, sk_set: [1, 2, 3], new_sk_set: null }),
      msg(404, 'not found'),
    ]);
    expect(await client.locateTimeline(tenant, timeline)).toEqual({
      generation: 3,
      sk_set: [1, 2, 3],
      new_sk_set: null,
    });
    expect(calls[0]?.url).toContain(
      `/debug/v1/tenant/${tenant}/timeline/${timeline}/locate`,
    );
    expect(await client.locateTimeline(tenant, timeline)).toBeNull();
  });

  it('posts the new set to safekeeper_migrate', async () => {
    const { client, calls } = setup([json({})]);
    await client.migrateTimeline(tenant, timeline, [1, 2, 4]);
    expect(calls[0]).toEqual({
      method: 'POST',
      url: `http://storcon.test:1234/v1/tenant/${tenant}/timeline/${timeline}/safekeeper_migrate`,
      body: { new_sk_set: [1, 2, 4] },
    });
  });

  it('does not retry a failed step, so the caller decides', async () => {
    const { client, calls } = setup([msg(500, 'pull_timeline to 4 failed')]);
    const error = await client
      .migrateTimeline(tenant, timeline, [1, 2, 4])
      .catch((e) => e);
    expect(error.status).toBe(500);
    expect(calls).toHaveLength(1);
  });

  it('surfaces a conflicting migration as 409', async () => {
    const { client } = setup([msg(409, 'already migrating')]);
    const error = await client
      .migrateTimeline(tenant, timeline, [1, 2, 4])
      .catch((e) => e);
    expect(error.status).toBe(409);
  });

  it('posts to safekeeper_migrate_abort without a body', async () => {
    const { client, calls } = setup([json({})]);
    await client.abortTimelineMigration(tenant, timeline);
    expect(calls[0]).toEqual({
      method: 'POST',
      url: `http://storcon.test:1234/v1/tenant/${tenant}/timeline/${timeline}/safekeeper_migrate_abort`,
      body: undefined,
    });
  });
});
