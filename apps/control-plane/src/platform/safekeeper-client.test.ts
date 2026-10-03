import { describe, expect, it, vi } from 'vitest';
import { newTestSigner } from '../neon/fakes.js';
import { createSafekeeperApi } from './safekeeper-client.js';

const signer = newTestSigner();
const tenant = 'a'.repeat(32);
const timeline = 'b'.repeat(32);

function setup(response: Response | Error) {
  const fakeFetch = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) => {
      if (response instanceof Error) throw response;
      return response;
    },
  ) as unknown as typeof fetch;
  return {
    fakeFetch,
    api: createSafekeeperApi({ signer, fetch: fakeFetch }),
  };
}

describe('listTimelines', () => {
  it('lists the timelines on the safekeeper behind its own Service, with a safekeeperdata token', async () => {
    const { api, fakeFetch } = setup(
      new Response(
        JSON.stringify([{ tenant_id: tenant, timeline_id: timeline }]),
      ),
    );
    expect(await api.listTimelines(4)).toEqual([
      { tenantId: tenant, timelineId: timeline },
    ]);
    const [url, init] = vi.mocked(fakeFetch).mock.calls[0] ?? [];
    expect(url).toBe(
      'http://safekeeper-4.neon.svc.cluster.local:7676/v1/tenant/timeline',
    );
    const token = new Headers(init?.headers)
      .get('authorization')
      ?.replace('Bearer ', '');
    expect(signer.verify(token ?? '')).toMatchObject({
      scope: 'safekeeperdata',
    });
  });

  it('returns an empty list for an empty safekeeper', async () => {
    const { api } = setup(new Response('[]'));
    expect(await api.listTimelines(1)).toEqual([]);
  });

  it('fails loudly when the safekeeper refuses or answers nonsense', async () => {
    await expect(
      setup(new Response('forbidden', { status: 403 })).api.listTimelines(1),
    ).rejects.toThrow(/answered 403/);
    await expect(
      setup(new Response('{}')).api.listTimelines(1),
    ).rejects.toThrow(/not an array/);
    await expect(
      setup(new Response('[{"tenant_id": 5}]')).api.listTimelines(1),
    ).rejects.toThrow(/malformed/);
  });

  it('does not hide an unreachable safekeeper as an empty one', async () => {
    await expect(
      setup(new Error('connect ECONNREFUSED')).api.listTimelines(1),
    ).rejects.toThrow(/ECONNREFUSED/);
  });
});
