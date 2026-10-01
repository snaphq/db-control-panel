import { describe, expect, it, vi } from 'vitest';
import {
  type StorconClientOptions,
  StorconError,
  createStorconClient,
} from './storcon-client.js';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function setup(
  responses: (Response | Error)[],
  options: Partial<StorconClientOptions> = {},
) {
  const calls: Call[] = [];
  const queue = [...responses];
  const fakeFetch = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method ?? 'GET',
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      const next = queue.shift();
      if (!next) throw new Error('unexpected request');
      if (next instanceof Error) throw next;
      return next;
    },
  ) as unknown as typeof fetch;
  const sleeps: number[] = [];
  const client = createStorconClient({
    baseUrl: 'http://storcon.test:1234/',
    token: 'admin-jwt',
    fetch: fakeFetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    retry: { attempts: 4, baseDelayMs: 100, maxDelayMs: 1000 },
    ...options,
  });
  return { client, calls, sleeps };
}

const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
const empty = (status: number) => new Response(null, { status });
const tenant = 'a'.repeat(32);
const timeline = 'b'.repeat(32);

describe('createTenant', () => {
  it('posts the bare tenant id with the retention as a humantime interval', async () => {
    const { client, calls } = setup([json({ shards: [] }, 201)]);
    await client.createTenant({
      tenantId: tenant,
      historyRetentionSeconds: 86_400,
    });
    expect(calls).toEqual([
      {
        url: 'http://storcon.test:1234/v1/tenant',
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer admin-jwt',
          'content-type': 'application/json',
        }),
        body: { new_tenant_id: tenant, pitr_interval: '86400s' },
      },
    ]);
  });

  it('reports the controller message on a client error without retrying', async () => {
    const { client, calls } = setup([json({ msg: 'bad shard params' }, 400)]);
    const error = await client
      .createTenant({ tenantId: tenant, historyRetentionSeconds: 0 })
      .catch((e) => e);
    expect(error).toBeInstanceOf(StorconError);
    expect(error).toMatchObject({
      status: 400,
      method: 'POST',
      path: '/v1/tenant',
    });
    expect(error.message).toContain('bad shard params');
    expect(calls).toHaveLength(1);
  });
});

describe('createTimeline', () => {
  const created = {
    timeline_id: timeline,
    ancestor_timeline_id: null,
    ancestor_lsn: null,
    last_record_lsn: '0/149F0D8',
    safekeepers: {
      tenant_id: tenant,
      timeline_id: timeline,
      generation: 1,
      safekeepers: [
        { id: 1, hostname: 'safekeeper-0.safekeeper.neon.svc.cluster.local' },
      ],
    },
  };

  it('bootstraps a root timeline and returns the safekeepers', async () => {
    const { client, calls } = setup([json(created, 201)]);
    const result = await client.createTimeline(tenant, {
      kind: 'root',
      timelineId: timeline,
      pgVersion: 17,
    });
    expect(calls[0]?.url).toBe(
      `http://storcon.test:1234/v1/tenant/${tenant}/timeline`,
    );
    expect(calls[0]?.body).toEqual({
      new_timeline_id: timeline,
      pg_version: 17,
    });
    expect(result.safekeepers?.generation).toBe(1);
    expect(result.safekeepers?.safekeepers[0]?.id).toBe(1);
  });

  it('branches from an ancestor at an LSN', async () => {
    const { client, calls } = setup([
      json({ ...created, ancestor_lsn: '0/16B5A50' }, 201),
    ]);
    const result = await client.createTimeline(tenant, {
      kind: 'branch',
      timelineId: timeline,
      ancestorTimelineId: 'c'.repeat(32),
      ancestorStartLsn: '0/16B5A50',
    });
    expect(calls[0]?.body).toEqual({
      new_timeline_id: timeline,
      ancestor_timeline_id: 'c'.repeat(32),
      ancestor_start_lsn: '0/16B5A50',
    });
    expect(result.ancestor_lsn).toBe('0/16B5A50');
  });

  it('omits the LSN to branch from the latest', async () => {
    const { client, calls } = setup([json(created, 201)]);
    await client.createTimeline(tenant, {
      kind: 'branch',
      timelineId: timeline,
      ancestorTimelineId: 'c'.repeat(32),
    });
    expect(calls[0]?.body).not.toHaveProperty('ancestor_start_lsn');
  });

  it('accepts a response without safekeepers', async () => {
    const { client } = setup([
      json({ timeline_id: timeline, safekeepers: null }, 200),
    ]);
    const result = await client.createTimeline(tenant, {
      kind: 'root',
      timelineId: timeline,
      pgVersion: 17,
    });
    expect(result.safekeepers).toBeNull();
  });

  it('fails clearly on a body it cannot read', async () => {
    const { client } = setup([json({ nope: true }, 201)]);
    await expect(
      client.createTimeline(tenant, {
        kind: 'root',
        timelineId: timeline,
        pgVersion: 17,
      }),
    ).rejects.toThrowError(/unexpected body/);
  });
});

describe('retries', () => {
  it('backs off on 503 and 429 and then succeeds', async () => {
    const { client, calls, sleeps } = setup([
      json({ msg: 'starting' }, 503),
      empty(429),
      json({ shards: [] }, 201),
    ]);
    await client.createTenant({ tenantId: tenant, historyRetentionSeconds: 1 });
    expect(calls).toHaveLength(3);
    expect(sleeps).toHaveLength(2);
    expect(sleeps[0]).toBeGreaterThanOrEqual(50);
    expect(sleeps[0]).toBeLessThanOrEqual(100);
    expect(sleeps[1]).toBeGreaterThanOrEqual(100);
    expect(sleeps[1]).toBeLessThanOrEqual(200);
  });

  it('honors Retry-After, capped at the maximum delay', async () => {
    const { client, sleeps } = setup([
      new Response(null, { status: 429, headers: { 'retry-after': '2' } }),
      new Response(null, { status: 429, headers: { 'retry-after': '60' } }),
      json({ shards: [] }, 201),
    ]);
    await client.createTenant({ tenantId: tenant, historyRetentionSeconds: 1 });
    expect(sleeps).toEqual([1000, 1000]);
  });

  it('retries a refused connection', async () => {
    const { client, calls } = setup([
      new TypeError('fetch failed'),
      json({ shards: [] }, 201),
    ]);
    await client.createTenant({ tenantId: tenant, historyRetentionSeconds: 1 });
    expect(calls).toHaveLength(2);
  });

  it('gives up after the configured attempts with the last failure', async () => {
    const { client, calls } = setup([
      json({ msg: 'busy' }, 503),
      json({ msg: 'busy' }, 503),
      json({ msg: 'busy' }, 503),
      json({ msg: 'still busy' }, 503),
    ]);
    const error = await client
      .createTenant({ tenantId: tenant, historyRetentionSeconds: 1 })
      .catch((e) => e);
    expect(calls).toHaveLength(4);
    expect(error).toBeInstanceOf(StorconError);
    expect(error.status).toBe(503);
    expect(error.message).toMatch(/after 4 attempts: 503 still busy/);
  });
});

describe('deletes', () => {
  it('treats 200 and 404 as deleted', async () => {
    const { client, calls } = setup([
      empty(200),
      empty(404),
      empty(200),
      empty(404),
    ]);
    await client.deleteTimeline(tenant, timeline);
    await client.deleteTimeline(tenant, timeline);
    await client.deleteTenant(tenant);
    await client.deleteTenant(tenant);
    expect(
      calls.map(
        (c) => `${c.method} ${c.url.replace('http://storcon.test:1234', '')}`,
      ),
    ).toEqual([
      `DELETE /v1/tenant/${tenant}/timeline/${timeline}`,
      `DELETE /v1/tenant/${tenant}/timeline/${timeline}`,
      `DELETE /v1/tenant/${tenant}`,
      `DELETE /v1/tenant/${tenant}`,
    ]);
  });

  it('asks again while the controller reports 409 or 202', async () => {
    const { client, calls } = setup([empty(409), empty(202), empty(200)]);
    await client.deleteTimeline(tenant, timeline);
    expect(calls).toHaveLength(3);
  });

  it('fails when the delete never completes', async () => {
    const { client } = setup([empty(409), empty(409), empty(409), empty(409)]);
    await expect(client.deleteTenant(tenant)).rejects.toThrowError(
      /after 4 attempts/,
    );
  });
});

describe('locateTenant', () => {
  it('parses the shard locations', async () => {
    const { client, calls } = setup([
      json({
        shards: [
          {
            shard_id: tenant,
            node_id: 1,
            listen_pg_addr: '100.64.0.1',
            listen_pg_port: 6400,
            listen_grpc_addr: null,
            listen_grpc_port: null,
            listen_http_addr: '100.64.0.1',
            listen_http_port: 9898,
            listen_https_port: null,
          },
        ],
        shard_params: { count: 0, stripe_size: 2048 },
      }),
    ]);
    const located = await client.locateTenant(tenant);
    expect(calls[0]?.url).toBe(
      `http://storcon.test:1234/debug/v1/tenant/${tenant}/locate`,
    );
    expect(located.shards[0]).toMatchObject({
      node_id: 1,
      listen_pg_port: 6400,
    });
  });

  it('surfaces "not attached" (400) to the caller', async () => {
    const { client } = setup([
      json({ msg: 'Cannot locate a tenant that is not attached' }, 400),
    ]);
    await expect(client.locateTenant(tenant)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('not attached'),
    });
  });
});

describe('nodes and safekeepers', () => {
  it('lists pageserver nodes', async () => {
    const node = {
      id: 1,
      availability: 'Active',
      scheduling: 'Active',
      availability_zone_id: 'az-1',
      listen_http_addr: '100.64.0.1',
      listen_http_port: 9898,
      listen_https_port: null,
      listen_pg_addr: '100.64.0.1',
      listen_pg_port: 6400,
      listen_grpc_addr: null,
      listen_grpc_port: null,
    };
    const { client, calls } = setup([json([node])]);
    expect(await client.listNodes()).toEqual([
      expect.objectContaining({ id: 1, listen_pg_addr: '100.64.0.1' }),
    ]);
    expect(calls[0]?.url).toBe('http://storcon.test:1234/control/v1/node');
  });

  it('upserts a safekeeper with the id in path and body', async () => {
    const { client, calls } = setup([empty(204)]);
    await client.upsertSafekeeper({
      id: 2,
      region_id: 'az-2',
      version: 1,
      host: 'safekeeper-1.safekeeper.neon.svc.cluster.local',
      port: 5454,
      http_port: 7676,
      availability_zone_id: 'az-2',
    });
    expect(calls[0]?.url).toBe(
      'http://storcon.test:1234/control/v1/safekeeper/2',
    );
    expect(calls[0]?.body).toMatchObject({
      id: 2,
      port: 5454,
      http_port: 7676,
    });
  });

  it('sets the scheduling policy by variant name', async () => {
    const { client, calls } = setup([json(null)]);
    await client.setSafekeeperSchedulingPolicy(3, 'Active');
    expect(calls[0]?.url).toBe(
      'http://storcon.test:1234/control/v1/safekeeper/3/scheduling_policy',
    );
    expect(calls[0]?.body).toEqual({ scheduling_policy: 'Active' });
  });

  it('lists safekeepers with their policy', async () => {
    const { client } = setup([
      json([
        {
          id: 1,
          region_id: 'az-1',
          version: 1,
          host: 'h',
          port: 5454,
          http_port: 7676,
          https_port: null,
          availability_zone_id: 'az-1',
          scheduling_policy: 'Activating',
        },
      ]),
    ]);
    expect((await client.listSafekeepers())[0]?.scheduling_policy).toBe(
      'Activating',
    );
  });
});
