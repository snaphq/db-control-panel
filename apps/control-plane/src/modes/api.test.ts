import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/client.js';
import {
  type MemoryOperationStore,
  createMemoryOperationStore,
} from '../operations/memory-store.js';
import { createApiRoutes, toOperationResponse } from './api.js';
import { createBaseApp } from './http.js';

/** Resolves `select().from().where()` to the rows the in-memory store holds for the project. */
function fakeDb(store: MemoryOperationStore): Database {
  return {
    select: () => ({
      from: () => ({
        where: async () => [...store.records.values()],
      }),
    }),
  } as unknown as Database;
}

function buildApp(store: MemoryOperationStore) {
  const app = createBaseApp(async () => {});
  app.route('/v1', createApiRoutes({ apiToken: 'token' }, fakeDb(store)));
  return app;
}

const headers = {
  authorization: 'Bearer token',
  'x-alloydb-org': 'org_1',
  'x-alloydb-project': 'console-project',
};

describe('GET /v1/operations/:id', () => {
  const store = createMemoryOperationStore();
  store.add('op_1', 'project.create', 'running');
  const app = buildApp(store);

  it('returns the operation', async () => {
    const response = await app.request('/v1/operations/op_1', { headers });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      operation: toOperationResponse(store.get('op_1')),
    });
  });

  it('serializes snake_case fields', () => {
    expect(toOperationResponse(store.get('op_1'))).toEqual({
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
    const response = await app.request('/v1/operations/op_1', {
      headers: { ...headers, authorization: 'Bearer nope' },
    });
    expect(response.status).toBe(401);
  });

  it('requires the org and project headers', async () => {
    const required = [
      ['x-alloydb-org', 'X-AlloyDB-Org'],
      ['x-alloydb-project', 'X-AlloyDB-Project'],
    ] as const;
    for (const [header, displayName] of required) {
      const partial: Record<string, string> = { ...headers };
      delete partial[header];
      const response = await app.request('/v1/operations/op_1', {
        headers: partial,
      });
      expect(response.status).toBe(400);
      expect(JSON.stringify(await response.json())).toContain(displayName);
    }
  });

  it('returns 404 for an unknown operation', async () => {
    const empty = buildApp(createMemoryOperationStore());
    const response = await empty.request('/v1/operations/op_missing', {
      headers,
    });
    expect(response.status).toBe(404);
  });
});

describe('health routes', () => {
  it('serves /healthz without auth', async () => {
    const app = buildApp(createMemoryOperationStore());
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
});
