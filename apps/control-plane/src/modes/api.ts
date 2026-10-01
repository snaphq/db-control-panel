import { Hono } from 'hono';
import type { ApiConfig } from '../config.js';
import { createSecretBox } from '../crypto/secretbox.js';
import { createDrizzleNeonStore } from '../neon/store-drizzle.js';
import type { Scope } from '../neon/store.js';
import {
  createBoss,
  createOperationQueue,
  startQueue,
} from '../operations/queue.js';
import { findOperation } from '../operations/repository.js';
import type { OperationRecord } from '../operations/store.js';
import { registerEndpointRoutes } from './api-endpoints.js';
import { registerProjectRoutes } from './api-projects.js';
import { registerRoleAndDatabaseRoutes } from './api-roles-databases.js';
import {
  type ApiContext,
  type ApiEnv,
  type NeonApiDeps,
  notFound,
  scopeOf,
  toOperationResponse,
} from './api-support.js';
import { bearerAuth } from './auth.js';
import { startHttpMode } from './http.js';
import type { RunningMode } from './types.js';

const missing = (c: ApiContext, header: string) =>
  c.json(
    { error: { code: 'bad_request', message: `Missing ${header} header` } },
    400,
  );

interface ApiDeps extends NeonApiDeps {
  apiToken: string;
  /** Reads an operation, scoped to the organization and console project that own it. */
  findOperation(id: string, scope: Scope): Promise<OperationRecord | null>;
}

/**
 * The `/v1` routes. Every route needs the service bearer token plus the
 * `X-AlloyDB-Org` and `X-AlloyDB-Project` headers the console sets, and every
 * store call below is filtered by those two ids: an id that belongs to another
 * organization or console project is indistinguishable from one that does not
 * exist.
 */
export function createApiRoutes(deps: ApiDeps): Hono<ApiEnv> {
  const v1 = new Hono<ApiEnv>();
  v1.use('*', bearerAuth(deps.apiToken));
  v1.use('*', async (c, next) => {
    const org = c.req.header('x-alloydb-org')?.trim();
    const project = c.req.header('x-alloydb-project')?.trim();
    if (!org) return missing(c, 'X-AlloyDB-Org');
    if (!project) return missing(c, 'X-AlloyDB-Project');
    c.set('identity', { org, project });
    await next();
  });

  v1.get('/operations/:id', async (c) => {
    const record = await deps.findOperation(c.req.param('id'), scopeOf(c));
    if (!record) return notFound(c, 'Operation');
    return c.json({ operation: toOperationResponse(record) });
  });

  registerProjectRoutes(v1, deps);
  registerEndpointRoutes(v1, deps);
  registerRoleAndDatabaseRoutes(v1, deps);
  return v1;
}

export function startApi(config: ApiConfig): Promise<RunningMode> {
  return startHttpMode(config, async ({ app, handle }) => {
    const boss = createBoss(config.databaseUrl, 'producer');
    await startQueue(boss);
    const store = createDrizzleNeonStore(handle.db, createOperationQueue(boss));
    app.route(
      '/v1',
      createApiRoutes({
        apiToken: config.apiToken,
        pgHostSuffix: config.pgHostSuffix,
        secrets: createSecretBox(config.dataKey),
        store,
        findOperation: (id, scope) =>
          findOperation(handle.db, id, scope.consoleProjectId, scope.orgId),
      }),
    );
    return () => boss.stop({ graceful: true, timeout: 10_000 });
  });
}
