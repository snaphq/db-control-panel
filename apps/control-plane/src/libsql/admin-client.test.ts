import { describe, expect, it } from 'vitest';
import {
  SqldAdminError,
  createSqldAdminClient,
  toNaiveUtc,
} from './admin-client.js';

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeAdmin(
  respond: (call: Recorded) => Response | Promise<Response> = () =>
    new Response(null, { status: 200 }),
) {
  const calls: Recorded[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const call: Recorded = {
      url,
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof fetch;
  return {
    calls,
    client: createSqldAdminClient({ authKey: 'k3y', fetch: fetchImpl }),
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

describe('createNamespace', () => {
  it('posts to the node admin port with the Basic key', async () => {
    const { client, calls } = fakeAdmin();
    expect(await client.createNamespace('100.64.0.7', 'orders-acme')).toBe(
      'created',
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: 'http://100.64.0.7:8081/v1/namespaces/orders-acme/create',
      method: 'POST',
      body: {},
    });
    expect(calls[0]?.headers.authorization).toBe('Basic k3y');
    expect(calls[0]?.headers['content-type']).toBe('application/json');
  });

  it('sends the size limit as a number of bytes', async () => {
    const { client, calls } = fakeAdmin();
    await client.createNamespace('100.64.0.7', 'a', {
      maxDbSizeBytes: 1_073_741_824,
    });
    expect(calls[0]?.body).toEqual({ max_db_size: 1_073_741_824 });
  });

  it('treats "already exists" (HTTP 400) as success so a retry converges', async () => {
    const { client } = fakeAdmin(() =>
      json(400, { error: 'Namespace `orders-acme` already exists' }),
    );
    expect(await client.createNamespace('100.64.0.7', 'orders-acme')).toBe(
      'exists',
    );
  });

  it('fails on any other error and keeps the status', async () => {
    const { client } = fakeAdmin(() => json(500, { error: 'disk full' }));
    await expect(
      client.createNamespace('100.64.0.7', 'a'),
    ).rejects.toMatchObject({
      name: 'SqldAdminError',
      status: 500,
      message: expect.stringContaining('disk full'),
    });
    const bad = fakeAdmin(() => json(400, { error: 'Invalid namespace' }));
    await expect(
      bad.client.createNamespace('100.64.0.7', 'a'),
    ).rejects.toBeInstanceOf(SqldAdminError);
  });

  it('reports an unreachable node with a null status', async () => {
    const client = createSqldAdminClient({
      authKey: 'k',
      fetch: (async () => {
        throw new TypeError('connect ECONNREFUSED');
      }) as unknown as typeof fetch,
    });
    await expect(
      client.createNamespace('100.64.0.7', 'a'),
    ).rejects.toMatchObject({
      status: null,
      message: expect.stringContaining('ECONNREFUSED'),
    });
  });

  it('brackets an IPv6 node address', async () => {
    const { client, calls } = fakeAdmin();
    await client.createNamespace('fd7a::1', 'a');
    expect(calls[0]?.url).toBe('http://[fd7a::1]:8081/v1/namespaces/a/create');
  });
});

describe('forkNamespace', () => {
  it('posts without a body when no timestamp is given', async () => {
    const { client, calls } = fakeAdmin();
    expect(await client.forkNamespace('100.64.0.7', 'a-acme', 'b-acme')).toBe(
      'forked',
    );
    expect(calls[0]).toMatchObject({
      url: 'http://100.64.0.7:8081/v1/namespaces/a-acme/fork/b-acme',
      method: 'POST',
      body: undefined,
    });
    expect(calls[0]?.headers).not.toHaveProperty('content-type');
  });

  it('sends the timestamp as a zone-less UTC date-time', async () => {
    const { client, calls } = fakeAdmin();
    await client.forkNamespace(
      '100.64.0.7',
      'a',
      'b',
      new Date('2026-03-04T05:06:07.891Z'),
    );
    expect(calls[0]?.body).toEqual({ timestamp: '2026-03-04T05:06:07' });
  });

  it('treats an existing target as success and a missing source as an error', async () => {
    const exists = fakeAdmin(() =>
      json(400, { error: 'Namespace `b` already exists' }),
    );
    expect(await exists.client.forkNamespace('100.64.0.7', 'a', 'b')).toBe(
      'exists',
    );
    const missing = fakeAdmin(() =>
      json(404, { error: "Namespace `a` doesn't exist" }),
    );
    await expect(
      missing.client.forkNamespace('100.64.0.7', 'a', 'b'),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('deleteNamespace', () => {
  it('prunes the backup unless told to keep it', async () => {
    const { client, calls } = fakeAdmin();
    expect(await client.deleteNamespace('100.64.0.7', 'a')).toBe('deleted');
    expect(calls[0]).toMatchObject({
      url: 'http://100.64.0.7:8081/v1/namespaces/a',
      method: 'DELETE',
      body: { keep_backup: false },
    });
    await client.deleteNamespace('100.64.0.7', 'a', { keepBackup: true });
    expect(calls[1]?.body).toEqual({ keep_backup: true });
  });

  it('treats a missing namespace as already deleted', async () => {
    const { client } = fakeAdmin(() =>
      json(404, { error: "Namespace `a` doesn't exist" }),
    );
    expect(await client.deleteNamespace('100.64.0.7', 'a')).toBe('missing');
  });

  it('fails on other errors', async () => {
    const { client } = fakeAdmin(() => new Response('boom', { status: 502 }));
    await expect(
      client.deleteNamespace('100.64.0.7', 'a'),
    ).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('boom'),
    });
  });
});

describe('client construction', () => {
  it('refuses a key sqld would split on whitespace', () => {
    expect(() => createSqldAdminClient({ authKey: 'a b' })).toThrowError(
      /whitespace/,
    );
    expect(() => createSqldAdminClient({ authKey: '' })).toThrowError();
  });
});

describe('toNaiveUtc', () => {
  it('drops the zone and fractional seconds', () => {
    expect(toNaiveUtc(new Date('2026-01-02T03:04:05.678Z'))).toBe(
      '2026-01-02T03:04:05',
    );
  });
});
