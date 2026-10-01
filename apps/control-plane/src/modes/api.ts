import type { Context } from 'hono';
import { Hono } from 'hono';
import type { ApiConfig } from '../config.js';
import type { Database } from '../db/client.js';
import {
  createBoss,
  createOperationQueue,
  startQueue,
} from '../operations/queue.js';
import { findOperation } from '../operations/repository.js';
import type { OperationRecord } from '../operations/store.js';
import { bearerAuth } from './auth.js';
import { startHttpMode } from './http.js';
import type { RunningMode } from './types.js';

/** Identity the console asserts after its own membership checks. */
interface ConsoleIdentity {
  org: string;
  project: string;
}

type ApiEnv = { Variables: { identity: ConsoleIdentity } };

const missing = (c: Context, header: string) =>
  c.json(
    { error: { code: 'bad_request', message: `Missing ${header} header` } },
    400,
  );

export function toOperationResponse(record: OperationRecord) {
  return {
    id: record.id,
    target_type: record.targetType,
    target_id: record.targetId,
    action: record.action,
    status: record.status,
    failures_count: record.failuresCount,
    error: record.error,
    created_at: record.createdAt.toISOString(),
    finished_at: record.finishedAt?.toISOString() ?? null,
  };
}

/**
 * The `/v1` routes. Every route needs the service bearer token plus the
 * `X-AlloyDB-Org` and `X-AlloyDB-Project` headers the console sets.
 */
export function createApiRoutes(
  config: Pick<ApiConfig, 'apiToken'>,
  db: Database,
): Hono<ApiEnv> {
  const v1 = new Hono<ApiEnv>();

  v1.use('*', bearerAuth(config.apiToken));
  v1.use('*', async (c, next) => {
    const org = c.req.header('x-alloydb-org')?.trim();
    const project = c.req.header('x-alloydb-project')?.trim();
    if (!org) return missing(c, 'X-AlloyDB-Org');
    if (!project) return missing(c, 'X-AlloyDB-Project');
    c.set('identity', { org, project });
    await next();
  });

  v1.get('/operations/:id', async (c) => {
    const { project } = c.get('identity');
    const record = await findOperation(db, c.req.param('id'), project);
    if (!record) {
      return c.json(
        { error: { code: 'not_found', message: 'Operation not found' } },
        404,
      );
    }
    return c.json({ operation: toOperationResponse(record) });
  });

  return v1;
}

export function startApi(config: ApiConfig): Promise<RunningMode> {
  return startHttpMode(config, async ({ app, handle }) => {
    const boss = createBoss(config.databaseUrl, 'producer');
    await startQueue(boss);
    // Mutation routes will create operations through this queue.
    createOperationQueue(boss);
    app.route('/v1', createApiRoutes(config, handle.db));
    return () => boss.stop({ graceful: true, timeout: 10_000 });
  });
}
