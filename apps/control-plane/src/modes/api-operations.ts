import {
  type ListOperationsResponse,
  listOperationsQuerySchema,
} from '@repo/control-plane-contract';
import type { Hono } from 'hono';
import type { Scope } from '../neon/store.js';
import {
  InvalidCursorError,
  type ListOperationsInput,
  type OperationPage,
} from '../operations/repository.js';
import {
  type ApiContext,
  type ApiEnv,
  type NeonApiDeps,
  apiError,
  notFound,
  parseQuery,
  scopeOf,
  toOperationResponse,
} from './api-support.js';

export interface OperationRouteDeps extends Pick<NeonApiDeps, 'store'> {
  /** Lists the operations of the scope's console project and organization. */
  listOperations(
    scope: Scope,
    query: Pick<ListOperationsInput, 'status' | 'limit' | 'cursor'>,
  ): Promise<OperationPage>;
}

/**
 * Operation lists (docs-internal/platform/control-plane.mdx, "Operations"):
 *
 * - `GET /projects/:project/operations` for a Postgres project of the caller;
 * - `GET /operations` for the console project as a whole, which also covers
 *   libSQL operations when the console project has no Postgres project.
 *
 * Both are scoped by organization and console project exactly like
 * `GET /operations/:id`, so another console project's operations never show.
 * An operation belongs to the console project, which holds at most one Postgres
 * project, so the project route lists the same operations as the other one.
 */
export function registerOperationRoutes(
  v1: Hono<ApiEnv>,
  deps: OperationRouteDeps,
): void {
  async function list(c: ApiContext): Promise<Response> {
    const query = parseQuery(c, listOperationsQuerySchema);
    if (!query.ok) return query.response;
    const scope = scopeOf(c);
    try {
      const page = await deps.listOperations(scope, query.data);
      const body: ListOperationsResponse = {
        operations: page.operations.map(toOperationResponse),
        next_cursor: page.nextCursor,
      };
      return c.json(body);
    } catch (error) {
      if (error instanceof InvalidCursorError) {
        return apiError(c, 400, 'bad_request', 'cursor: not a valid cursor');
      }
      throw error;
    }
  }

  v1.get('/operations', list);

  v1.get('/projects/:project/operations', async (c) => {
    if (!(await deps.store.findProject(scopeOf(c), c.req.param('project')))) {
      return notFound(c, 'Project');
    }
    return list(c);
  });
}
