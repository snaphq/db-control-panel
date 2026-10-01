import {
  endpointOperationResponseSchema,
  endpointResponseSchema,
  listEndpointsResponseSchema,
} from '@repo/control-plane-contract';
import { describe, expect, it } from 'vitest';
import {
  alice,
  buildApi,
  call,
  createProject,
  finishOperations,
} from './api.fixture.js';

async function setup() {
  const api = buildApi();
  const created = await createProject(api);
  const path = (suffix = '') =>
    `/projects/${created.projectId}/endpoints${suffix}`;
  return { api, ...created, path };
}

describe('endpoint reads', () => {
  it('lists, filters by branch and gets an endpoint', async () => {
    const t = await setup();
    const all = listEndpointsResponseSchema.parse(
      await (await call(t.api, 'GET', t.path())).json(),
    );
    expect(all.endpoints.map((e) => e.id)).toEqual([t.endpointId]);
    const none = listEndpointsResponseSchema.parse(
      await (await call(t.api, 'GET', `${t.path()}?branch_id=br_other`)).json(),
    );
    expect(none.endpoints).toEqual([]);
    const one = endpointResponseSchema.parse(
      await (await call(t.api, 'GET', t.path(`/${t.endpointId}`))).json(),
    );
    expect(one.endpoint).toMatchObject({
      id: t.endpointId,
      project_id: t.projectId,
      state: 'idle',
    });
    expect(
      (await call(t.api, 'GET', t.path('/ep-no-such-00000000'))).status,
    ).toBe(404);
  });

  it('reports the running state the worker recorded', async () => {
    const t = await setup();
    const row = t.api.store.endpoints.get(t.endpointId);
    if (row) {
      row.state = 'running';
      row.lastActiveAt = new Date('2026-02-03T04:05:06Z');
    }
    const body = endpointResponseSchema.parse(
      await (await call(t.api, 'GET', t.path(`/${t.endpointId}`))).json(),
    );
    expect(body.endpoint).toMatchObject({
      state: 'running',
      last_active_at: '2026-02-03T04:05:06.000Z',
    });
  });
});

describe('endpoint mutations', () => {
  it('creates a read-only endpoint through the update plan', async () => {
    const t = await setup();
    const response = await call(t.api, 'POST', t.path(), {
      body: { branch_id: t.branchId, type: 'read_only', compute_size: '0.25' },
    });
    expect(response.status).toBe(202);
    const body = endpointOperationResponseSchema.parse(await response.json());
    expect(body.endpoint).toMatchObject({
      type: 'read_only',
      compute_size: '0.25',
      state: 'idle',
    });
    expect(body.operation.action).toBe('endpoint.update');
    expect(t.api.store.endpoints.has(body.endpoint.id)).toBe(true);
  });

  it('allows one read_write endpoint per branch and needs a real branch', async () => {
    const t = await setup();
    const dup = await call(t.api, 'POST', t.path(), {
      body: { branch_id: t.branchId },
    });
    expect(dup.status).toBe(409);
    const missing = await call(t.api, 'POST', t.path(), {
      body: { branch_id: 'br_none' },
    });
    expect(missing.status).toBe(404);
    expect((await call(t.api, 'POST', t.path(), { body: {} })).status).toBe(
      400,
    );
  });

  it('restarts on a size change and updates in place otherwise', async () => {
    const t = await setup();
    const resize = await call(t.api, 'PATCH', t.path(`/${t.endpointId}`), {
      body: { compute_size: '4' },
    });
    expect(resize.status).toBe(202);
    const resized = endpointOperationResponseSchema.parse(await resize.json());
    expect(resized.endpoint.compute_size).toBe('4');
    expect(t.api.store.operations.get(resized.operation.id)?.params).toEqual({
      restart: true,
    });
    expect(t.api.store.endpoints.get(t.endpointId)).toMatchObject({
      computeSize: '4',
      suspendTimeoutSeconds: 300,
    });

    finishOperations(t.api);
    const timeout = await call(t.api, 'PATCH', t.path(`/${t.endpointId}`), {
      body: { suspend_timeout_seconds: 0, compute_size: '4' },
    });
    const body = endpointOperationResponseSchema.parse(await timeout.json());
    expect(t.api.store.operations.get(body.operation.id)?.params).toEqual({
      restart: false,
    });
    expect(body.endpoint.suspend_timeout_seconds).toBe(0);
  });

  it('rejects empty and invalid updates', async () => {
    const t = await setup();
    expect(
      (await call(t.api, 'PATCH', t.path(`/${t.endpointId}`), { body: {} }))
        .status,
    ).toBe(400);
    expect(
      (
        await call(t.api, 'PATCH', t.path(`/${t.endpointId}`), {
          body: { compute_size: '9' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(t.api, 'PATCH', t.path('/ep-none-none-00000000'), {
          body: { compute_size: '2' },
        })
      ).status,
    ).toBe(404);
  });

  it('queues start and suspend', async () => {
    const t = await setup();
    const start = await call(t.api, 'POST', t.path(`/${t.endpointId}/start`));
    expect(start.status).toBe(202);
    const started = endpointOperationResponseSchema.parse(await start.json());
    expect(started.operation).toMatchObject({
      action: 'endpoint.start',
      target_id: t.endpointId,
    });
    finishOperations(t.api);
    const suspend = endpointOperationResponseSchema.parse(
      await (
        await call(t.api, 'POST', t.path(`/${t.endpointId}/suspend`))
      ).json(),
    );
    expect(suspend.operation).toMatchObject({
      action: 'endpoint.suspend',
      target_id: t.endpointId,
    });
    expect(
      (await call(t.api, 'POST', t.path('/ep-none-none-00000000/start')))
        .status,
    ).toBe(404);
  });

  it('deletes an endpoint at once and stops its compute afterwards', async () => {
    const t = await setup();
    const response = await call(t.api, 'DELETE', t.path(`/${t.endpointId}`));
    expect(response.status).toBe(202);
    const body = endpointOperationResponseSchema.parse(await response.json());
    expect(body.operation.action).toBe('endpoint.suspend');
    expect(t.api.store.operations.get(body.operation.id)?.params).toEqual({
      delete: true,
    });
    expect(t.api.store.endpoints.get(t.endpointId)?.deletedAt).not.toBeNull();
    finishOperations(t.api);
    expect((await call(t.api, 'GET', t.path(`/${t.endpointId}`))).status).toBe(
      404,
    );
    // The branch can have a new read_write endpoint again.
    expect(
      (await call(t.api, 'POST', t.path(), { body: { branch_id: t.branchId } }))
        .status,
    ).toBe(202);
  });

  it('is scoped: another console project cannot start this endpoint', async () => {
    const t = await setup();
    const stranger = { org: alice.org, project: 'console-other' };
    const response = await call(
      t.api,
      'POST',
      t.path(`/${t.endpointId}/start`),
      { caller: stranger },
    );
    expect(response.status).toBe(404);
    expect(t.api.store.operations.size).toBe(1);
  });
});
