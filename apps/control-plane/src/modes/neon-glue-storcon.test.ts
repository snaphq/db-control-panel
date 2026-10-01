import { describe, expect, it } from 'vitest';
import { newNeonId } from '../crypto/ids.js';
import { CONTROL_TOKEN, PROXY_TOKEN, put, setup } from './neon-glue.fixture.js';

describe('/storcon authentication and validation', () => {
  it('requires the control-plane token', async () => {
    const t = await setup();
    for (const path of [
      '/storcon/notify-attach',
      '/storcon/notify-safekeepers',
    ]) {
      expect((await put(t.app, path, {}, 'wrong')).status).toBe(401);
      expect((await put(t.app, path, {}, PROXY_TOKEN)).status).toBe(401);
      expect(
        (await t.app.request(path, { method: 'PUT', body: '{}' })).status,
      ).toBe(401);
    }
  });

  it('rejects malformed bodies with 400, which the controller never retries', async () => {
    const t = await setup();
    expect(
      (await put(t.app, '/storcon/notify-attach', 'not json')).status,
    ).toBe(400);
    expect(
      (
        await put(t.app, '/storcon/notify-attach', {
          tenant_id: 'x',
          shards: [],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await put(t.app, '/storcon/notify-safekeepers', {
          tenant_id: t.tenantId,
        })
      ).status,
    ).toBe(400);
  });
});

describe('PUT /storcon/notify-attach', () => {
  const attach = (tenantId: string, nodeId = 2) => ({
    tenant_id: tenantId,
    preferred_az: 'az-1',
    stripe_size: null,
    shards: [{ node_id: nodeId, shard_number: 0 }],
  });

  it('is 404 for an unknown tenant, which the controller tolerates during creation', async () => {
    const t = await setup();
    expect(
      (await put(t.app, '/storcon/notify-attach', attach(newNeonId()))).status,
    ).toBe(404);
  });

  it('succeeds without touching anything when no compute is running', async () => {
    const t = await setup();
    const response = await put(
      t.app,
      '/storcon/notify-attach',
      attach(t.tenantId),
    );
    expect(response.status).toBe(200);
    expect(t.computeCtl.configured).toEqual([]);
    expect(t.storcon.calls).not.toContain('listNodes');
  });

  it('reloads a running compute with the pageserver from the notification', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    const response = await put(
      t.app,
      '/storcon/notify-attach',
      attach(t.tenantId, 2),
    );
    expect(response.status).toBe(200);
    const push = t.computeCtl.configured[0];
    expect(push?.computeId).toBe(t.endpointId);
    expect(
      push?.config.spec.pageserver_connection_info.shards['0000']
        ?.pageservers[0],
    ).toEqual({
      id: 2,
      libpq_url: 'postgres://no_user@100.64.0.2:6400',
      grpc_url: null,
    });
  });

  it('answers 503 when the compute cannot be reloaded, so the controller retries', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    t.computeCtl.failConfigure = true;
    expect(
      (await put(t.app, '/storcon/notify-attach', attach(t.tenantId))).status,
    ).toBe(503);
  });

  it('answers 503 for a pageserver it does not know', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    expect(
      (await put(t.app, '/storcon/notify-attach', attach(t.tenantId, 99)))
        .status,
    ).toBe(503);
    expect(t.computeCtl.configured).toEqual([]);
  });

  it('answers 423 while a compute is still starting', async () => {
    const t = await setup();
    await t.store.claimEndpointState(t.endpointId, ['idle'], 'starting');
    expect(
      (await put(t.app, '/storcon/notify-attach', attach(t.tenantId))).status,
    ).toBe(423);
  });
});

describe('PUT /storcon/notify-safekeepers', () => {
  const notice = (
    t: { tenantId: string; timelineId: string },
    generation: number,
    ids = [1, 2, 3],
  ) => ({
    tenant_id: t.tenantId,
    timeline_id: t.timelineId,
    generation,
    safekeepers: ids.map((id) => ({ id, hostname: null })),
  });

  it('is 404 for an unknown timeline', async () => {
    const t = await setup();
    expect(
      (
        await put(t.app, '/storcon/notify-safekeepers', {
          ...notice(t, 2),
          timeline_id: newNeonId(),
        })
      ).status,
    ).toBe(404);
  });

  it('stores the new placement, deriving hostnames the controller omits', async () => {
    const t = await setup();
    const response = await put(
      t.app,
      '/storcon/notify-safekeepers',
      notice(t, 2, [2, 3, 4]),
    );
    expect(response.status).toBe(200);
    expect(t.store.branches.get(t.branchId)?.safekeepers).toEqual({
      generation: 2,
      safekeepers: [
        { id: 2, hostname: 'safekeeper-1.safekeeper.neon.svc.cluster.local' },
        { id: 3, hostname: 'safekeeper-2.safekeeper.neon.svc.cluster.local' },
        { id: 4, hostname: 'safekeeper-3.safekeeper.neon.svc.cluster.local' },
      ],
    });
  });

  it('reloads a running compute with the new safekeepers and generation', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    expect(
      (await put(t.app, '/storcon/notify-safekeepers', notice(t, 5))).status,
    ).toBe(200);
    const spec = t.computeCtl.configured[0]?.config.spec;
    expect(spec?.safekeepers_generation).toBe(5);
    expect(spec?.safekeeper_connstrings).toHaveLength(3);
  });

  it('ignores a notification older than what is stored', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    await put(t.app, '/storcon/notify-safekeepers', notice(t, 5));
    t.computeCtl.configured.length = 0;
    const stale = await put(
      t.app,
      '/storcon/notify-safekeepers',
      notice(t, 3, [1, 2, 4]),
    );
    expect(stale.status).toBe(200);
    expect(t.computeCtl.configured).toEqual([]);
    expect(t.store.branches.get(t.branchId)?.safekeepers?.generation).toBe(5);
  });

  it('answers 503 when the reload fails and succeeds again on the retry', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    t.computeCtl.failConfigure = true;
    expect(
      (await put(t.app, '/storcon/notify-safekeepers', notice(t, 6))).status,
    ).toBe(503);
    t.computeCtl.failConfigure = false;
    expect(
      (await put(t.app, '/storcon/notify-safekeepers', notice(t, 6))).status,
    ).toBe(200);
    expect(t.computeCtl.configured).toHaveLength(1);
  });
});
