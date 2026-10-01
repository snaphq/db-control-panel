import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createEd25519Signer } from '../crypto/ed25519.js';
import {
  ComputeCtlError,
  createComputeCtlClient,
} from './compute-ctl-client.js';
import type { ComputeConfigResponse } from './spec.js';

const signer = createEd25519Signer(generateKeyPairSync('ed25519').privateKey);

function setup(respond: (url: string, init: RequestInit) => Response | Error) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fakeFetch = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      const result = respond(String(url), init ?? {});
      if (result instanceof Error) throw result;
      return result;
    },
  ) as unknown as typeof fetch;
  return {
    calls,
    client: createComputeCtlClient({ signer, fetch: fakeFetch }),
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe('compute_ctl client', () => {
  it('reads the status with an admin token for the compute', async () => {
    const { client, calls } = setup(() =>
      json({
        status: 'running',
        last_active: '2026-01-01T00:00:00+00:00',
        error: null,
        start_time: '2026-01-01T00:00:00Z',
      }),
    );
    const report = await client.status('10.42.0.5', 'ep-a');
    expect(report).toEqual({
      status: 'running',
      lastActive: new Date('2026-01-01T00:00:00Z'),
      error: null,
    });
    expect(calls[0]?.url).toBe('http://10.42.0.5:3080/status');
    const token = String(
      (calls[0]?.init.headers as Record<string, string>).authorization,
    ).replace('Bearer ', '');
    expect(signer.verify(token)).toMatchObject({
      scope: 'compute_ctl:admin',
      aud: ['compute'],
      compute_id: 'ep-a',
    });
  });

  it('reports no activity as null', async () => {
    const { client } = setup(() => json({ status: 'init', last_active: null }));
    expect(await client.status('10.0.0.1', 'ep-a')).toMatchObject({
      status: 'init',
      lastActive: null,
    });
  });

  it('brackets IPv6 pod addresses', async () => {
    const { client, calls } = setup(() => json({ status: 'running' }));
    await client.status('fd00::5', 'ep-a');
    expect(calls[0]?.url).toBe('http://[fd00::5]:3080/status');
  });

  it('names the endpoint and reason when it is unreachable or unhappy', async () => {
    const down = setup(() => new TypeError('connect ECONNREFUSED'));
    await expect(down.client.status('10.0.0.1', 'ep-a')).rejects.toMatchObject({
      status: null,
      message: expect.stringContaining('unreachable'),
    });
    const unauthorized = setup(() => json({ error: 'invalid audience' }, 401));
    const error = await unauthorized.client
      .status('10.0.0.1', 'ep-a')
      .catch((e) => e);
    expect(error).toBeInstanceOf(ComputeCtlError);
    expect(error).toMatchObject({ status: 401 });
    expect(error.message).toContain('invalid audience');
  });

  it('pushes only the spec and the ctl config to /configure', async () => {
    const { client, calls } = setup(() => json({ status: 'running' }));
    const config = {
      status: 'attached',
      spec: { format_version: 1 },
      compute_ctl_config: { jwks: { keys: [] } },
    } as unknown as ComputeConfigResponse;
    await client.configure('10.0.0.1', 'ep-a', config);
    expect(calls[0]?.url).toBe('http://10.0.0.1:3080/configure');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      spec: { format_version: 1 },
      compute_ctl_config: { jwks: { keys: [] } },
    });
  });

  it('surfaces a failed configure', async () => {
    const { client } = setup(() =>
      json({ error: 'compute configuration failed' }, 500),
    );
    await expect(
      client.configure('10.0.0.1', 'ep-a', {} as ComputeConfigResponse),
    ).rejects.toThrowError(
      /configure returned 500: compute configuration failed/,
    );
  });

  it('terminates in fast mode and accepts 201 for an already terminated compute', async () => {
    const { client, calls } = setup(() => json({ lsn: null }, 201));
    await client.terminate('10.0.0.1', 'ep-a');
    expect(calls[0]?.url).toBe('http://10.0.0.1:3080/terminate?mode=fast');
    expect(calls[0]?.init.method).toBe('POST');
  });

  it('fails terminate on an invalid status', async () => {
    const { client } = setup(() =>
      json({ error: 'invalid compute status: init' }, 409),
    );
    await expect(client.terminate('10.0.0.1', 'ep-a')).rejects.toMatchObject({
      status: 409,
    });
  });
});
