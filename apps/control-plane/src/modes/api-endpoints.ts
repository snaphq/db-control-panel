import {
  createEndpointRequestSchema,
  updateEndpointRequestSchema,
} from '@repo/control-plane-contract';
import type { Hono } from 'hono';
import { newEndpointId } from '../crypto/ids.js';
import type {
  DesiredStateChange,
  EndpointRow,
  OperationInput,
} from '../neon/store.js';
import {
  type ApiContext,
  type ApiEnv,
  type NeonApiDeps,
  apiError,
  notFound,
  parseBody,
  scopeOf,
  toEndpoint,
  toOperationResponse,
} from './api-support.js';

const DEFAULT_COMPUTE_SIZE = '1';
const DEFAULT_SUSPEND_TIMEOUT_SECONDS = 300;

export function registerEndpointRoutes(
  v1: Hono<ApiEnv>,
  deps: NeonApiDeps,
): void {
  const { store, pgHostSuffix } = deps;

  async function loadEndpoint(c: ApiContext): Promise<EndpointRow | null> {
    return store.findEndpoint(
      scopeOf(c),
      c.req.param('project') ?? '',
      c.req.param('endpoint') ?? '',
    );
  }

  /** Commits a mutation of one endpoint and answers 202 with the endpoint as it will be. */
  async function mutate(
    c: ApiContext,
    endpoint: EndpointRow,
    operation: Omit<OperationInput, 'targetType' | 'targetId'>,
    changes: DesiredStateChange[],
    after: EndpointRow = endpoint,
  ) {
    const record = await store.commit(
      scopeOf(c),
      { ...operation, targetType: 'endpoint', targetId: endpoint.id },
      changes,
    );
    return c.json(
      {
        endpoint: toEndpoint(after, c.req.param('project') ?? '', pgHostSuffix),
        operation: toOperationResponse(record),
      },
      202,
    );
  }

  v1.get('/projects/:project/endpoints', async (c) => {
    const scope = scopeOf(c);
    const projectId = c.req.param('project');
    if (!(await store.findProject(scope, projectId)))
      return notFound(c, 'Project');
    const endpoints = await store.listEndpoints(scope, projectId, {
      branchId: c.req.query('branch_id'),
    });
    return c.json({
      endpoints: endpoints.map((e) => toEndpoint(e, projectId, pgHostSuffix)),
    });
  });

  v1.get('/projects/:project/endpoints/:endpoint', async (c) => {
    const endpoint = await loadEndpoint(c);
    if (!endpoint) return notFound(c, 'Endpoint');
    return c.json({
      endpoint: toEndpoint(endpoint, c.req.param('project'), pgHostSuffix),
    });
  });

  v1.post('/projects/:project/endpoints', async (c) => {
    const body = await parseBody(c, createEndpointRequestSchema);
    if (!body.ok) return body.response;
    const scope = scopeOf(c);
    const projectId = c.req.param('project');
    const branch = await store.findBranch(
      scope,
      projectId,
      body.data.branch_id,
    );
    if (!branch) return notFound(c, 'Branch');
    const type = body.data.type ?? 'read_write';
    if (type === 'read_write') {
      const existing = await store.listEndpoints(scope, projectId, {
        branchId: branch.id,
      });
      if (existing.some((e) => e.type === 'read_write')) {
        return apiError(
          c,
          409,
          'conflict',
          'This branch already has a read_write endpoint',
        );
      }
    }
    const endpoint: EndpointRow = {
      id: newEndpointId(),
      branchId: branch.id,
      type,
      computeSize: body.data.compute_size ?? DEFAULT_COMPUTE_SIZE,
      suspendTimeoutSeconds:
        body.data.suspend_timeout_seconds ?? DEFAULT_SUSPEND_TIMEOUT_SECONDS,
      state: 'idle',
      podName: null,
      podIp: null,
      lastActiveAt: null,
      createdAt: new Date(),
      deletedAt: null,
    };
    // Nothing runs for a new endpoint; it goes through the update plan so the
    // project lock and the operation record are the same as for every mutation.
    return mutate(
      c,
      endpoint,
      { action: 'endpoint.update', params: { restart: false, created: true } },
      [{ kind: 'endpoint.insert', row: endpoint }],
    );
  });

  v1.patch('/projects/:project/endpoints/:endpoint', async (c) => {
    const body = await parseBody(c, updateEndpointRequestSchema);
    if (!body.ok) return body.response;
    const endpoint = await loadEndpoint(c);
    if (!endpoint) return notFound(c, 'Endpoint');
    const computeSize = body.data.compute_size ?? endpoint.computeSize;
    const suspendTimeoutSeconds =
      body.data.suspend_timeout_seconds ?? endpoint.suspendTimeoutSeconds;
    return mutate(
      c,
      endpoint,
      {
        action: 'endpoint.update',
        // A new size needs a new pod; anything else is applied in place.
        params: { restart: computeSize !== endpoint.computeSize },
      },
      [
        {
          kind: 'endpoint.update',
          id: endpoint.id,
          set: { computeSize, suspendTimeoutSeconds },
        },
      ],
      { ...endpoint, computeSize, suspendTimeoutSeconds },
    );
  });

  v1.post('/projects/:project/endpoints/:endpoint/start', async (c) => {
    const endpoint = await loadEndpoint(c);
    if (!endpoint) return notFound(c, 'Endpoint');
    return mutate(c, endpoint, { action: 'endpoint.start' }, []);
  });

  v1.post('/projects/:project/endpoints/:endpoint/suspend', async (c) => {
    const endpoint = await loadEndpoint(c);
    if (!endpoint) return notFound(c, 'Endpoint');
    return mutate(c, endpoint, { action: 'endpoint.suspend' }, []);
  });

  v1.delete('/projects/:project/endpoints/:endpoint', async (c) => {
    const endpoint = await loadEndpoint(c);
    if (!endpoint) return notFound(c, 'Endpoint');
    // Marked deleted now, so the proxy stops waking it; the suspend step then
    // stops the pod that may still be running.
    return mutate(
      c,
      endpoint,
      { action: 'endpoint.suspend', params: { delete: true } },
      [{ kind: 'endpoint.markDeleted', ids: [endpoint.id] }],
    );
  });
}
