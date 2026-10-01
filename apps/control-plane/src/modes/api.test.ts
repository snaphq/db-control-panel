import { operationResponseSchema } from '@repo/control-plane-contract';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryNeonStore } from '../neon/store-memory.js';
import { createMemoryOperationStore } from '../operations/memory-store.js';
import { toOperationResponse } from './api-support.js';
import {
  alice,
  bob,
  buildApi,
  call,
  createProject,
  headersFor,
} from './api.fixture.js';
import { createBaseApp } from './http.js';

describe('GET /v1/operations/:id', () => {
  const operations = createMemoryOperationStore();
  operations.add('op_1', 'project.create', 'running');
  const record = operations.get('op_1');
  const store = createMemoryNeonStore();
  store.operations.set('op_1', record);
  const api = buildApi(store);

  it('returns the operation in the contract shape', async () => {
    const response = await call(api, 'GET', '/operations/op_1', {
      caller: { org: 'org_1', project: 'console-project' },
    });
    expect(response.status).toBe(200);
    const body = operationResponseSchema.parse(await response.json());
    expect(body).toEqual({ operation: toOperationResponse(record) });
  });

  it('serializes snake_case fields', () => {
    expect(toOperationResponse(record)).toEqual({
      id: 'op_1',
      target_type: 'project',
      target_id: 'proj_1',
      action: 'project.create',
      status: 'running',
      failures_count: 0,
      error: null,
      created_at: '2026-01-01T00:00:00.000Z',
      finished_at: null,
    });
  });

  it('requires the bearer token before anything else', async () => {
    const response = await api.app.request('/v1/operations/op_1', {
      headers: { ...headersFor(alice), authorization: 'Bearer nope' },
    });
    expect(response.status).toBe(401);
    expect((await api.app.request('/v1/projects')).status).toBe(401);
  });

  it('requires the org and project headers on every route', async () => {
    for (const path of [
      '/v1/operations/op_1',
      '/v1/projects',
      '/v1/projects/proj_x/branches',
    ]) {
      for (const [header, displayName] of [
        ['x-alloydb-org', 'X-AlloyDB-Org'],
        ['x-alloydb-project', 'X-AlloyDB-Project'],
      ] as const) {
        const partial: Record<string, string> = { ...headersFor(alice) };
        delete partial[header];
        const response = await api.app.request(path, { headers: partial });
        expect(response.status).toBe(400);
        expect(JSON.stringify(await response.json())).toContain(displayName);
      }
    }
  });

  it('returns 404 for an unknown operation', async () => {
    const empty = buildApi();
    const response = await call(empty, 'GET', '/operations/op_missing');
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('not_found');
  });

  it('does not show one console project the operations of another', async () => {
    const shared = buildApi();
    await createProject(shared, alice);
    const [aliceOp] = [...shared.store.operations.values()];
    expect(
      (await call(shared, 'GET', `/operations/${aliceOp?.id}`)).status,
    ).toBe(200);
    expect(
      (await call(shared, 'GET', `/operations/${aliceOp?.id}`, { caller: bob }))
        .status,
    ).toBe(404);
  });
});

describe('health routes', () => {
  it('serves /healthz without auth', async () => {
    const app = createBaseApp(async () => {});
    const response = await app.request('/healthz');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('reports /readyz 200 when the database answers and 503 when it does not', async () => {
    const ready = createBaseApp(async () => {});
    expect((await ready.request('/readyz')).status).toBe(200);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const down = createBaseApp(async () => {
      throw new Error('connection refused');
    });
    const response = await down.request('/readyz');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
  });

  it('maps ProjectBusyError to 423', async () => {
    const { ProjectBusyError } = await import('../operations/repository.js');
    const app = createBaseApp(async () => {});
    app.post('/busy', () => {
      throw new ProjectBusyError('console-project', 'op_9');
    });
    const response = await app.request('/busy', { method: 'POST' });
    expect(response.status).toBe(423);
    expect(JSON.stringify(await response.json())).toContain('op_9');
  });

  it('maps a unique violation to 409', async () => {
    const app = createBaseApp(async () => {});
    app.post('/dup', () => {
      throw Object.assign(new Error('duplicate key'), { code: '23505' });
    });
    expect((await app.request('/dup', { method: 'POST' })).status).toBe(409);
  });
});
