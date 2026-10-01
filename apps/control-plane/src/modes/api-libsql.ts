import {
  type LibsqlDatabase,
  createLibsqlDatabaseRequestSchema,
  createLibsqlTokenRequestSchema,
  forkLibsqlDatabaseRequestSchema,
} from '@repo/control-plane-contract';
import type { Hono } from 'hono';
import type { Ed25519Signer } from '../crypto/ed25519.js';
import { newId } from '../crypto/ids.js';
import { libsqlHostname, libsqlUrl, namespaceFor } from '../libsql/names.js';
import { pickLibsqlNode } from '../libsql/placement.js';
import type { LibsqlStore } from '../libsql/store.js';
import { mintLibsqlToken } from '../libsql/tokens.js';
import type { LibsqlDatabaseRow } from '../neon/store.js';
import {
  type ApiContext,
  type ApiEnv,
  apiError,
  notFound,
  parseBody,
  parseOptionalBody,
  scopeOf,
  toOperationResponse,
} from './api-support.js';

export interface LibsqlApiDeps {
  libsql: LibsqlStore;
  /** Databases are served at `<namespace>.<suffix>`. */
  libsqlHostSuffix: string;
  /** Signs sqld tokens; without it the token route answers 503. */
  libsqlSigner: Ed25519Signer | null;
}

/** A fork may not ask for data from the future; allow a little clock skew. */
const FUTURE_SKEW_MS = 5_000;

function toLibsqlDatabase(
  row: LibsqlDatabaseRow,
  hostSuffix: string,
): LibsqlDatabase {
  return {
    id: row.id,
    name: row.name,
    namespace: row.namespace,
    hostname: libsqlHostname(row.namespace, hostSuffix),
    url: libsqlUrl(row.namespace, hostSuffix),
    node_id: row.nodeId,
    state: row.state,
    size_limit_bytes: row.sizeLimitBytes,
    created_at: row.createdAt.toISOString(),
  };
}

const unavailable = (c: ApiContext, code: string, message: string) =>
  c.json({ error: { code, message } }, 503);

/** `/v1/libsql/*`: every database is scoped by organization and console project. */
export function registerLibsqlRoutes(
  v1: Hono<ApiEnv>,
  deps: LibsqlApiDeps,
): void {
  const { libsql, libsqlHostSuffix: suffix } = deps;
  const view = (row: LibsqlDatabaseRow) => toLibsqlDatabase(row, suffix);

  /** The namespace for a new database, or the response to send when it cannot be used. */
  async function claimNamespace(
    c: ApiContext,
    name: string,
  ): Promise<{ namespace: string } | { response: Response }> {
    const namespace = namespaceFor(name, scopeOf(c).orgId);
    if (await libsql.findByNamespace(namespace)) {
      return {
        response: apiError(
          c,
          409,
          'conflict',
          `A libSQL database named "${name}" already exists in this organization`,
        ),
      };
    }
    return { namespace };
  }

  v1.get('/libsql/databases', async (c) => {
    const rows = await libsql.list(scopeOf(c));
    return c.json({ libsql_databases: rows.map(view) });
  });

  v1.get('/libsql/databases/:id', async (c) => {
    const row = await libsql.find(scopeOf(c), c.req.param('id'));
    if (!row) return notFound(c, 'Database');
    return c.json({ libsql_database: view(row) });
  });

  v1.post('/libsql/databases', async (c) => {
    const body = await parseBody(c, createLibsqlDatabaseRequestSchema);
    if (!body.ok) return body.response;
    const scope = scopeOf(c);
    const claim = await claimNamespace(c, body.data.name);
    if ('response' in claim) return claim.response;

    const [nodes, counts] = await Promise.all([
      libsql.listNodes(),
      libsql.countByNode(),
    ]);
    const node = pickLibsqlNode(nodes, counts);
    if (!node) {
      return unavailable(
        c,
        'no_capacity',
        'No libSQL node has room for another database right now',
      );
    }
    const row = {
      id: newId('ldb'),
      consoleProjectId: scope.consoleProjectId,
      consoleOrgId: scope.orgId,
      name: body.data.name,
      namespace: claim.namespace,
      nodeId: node.id,
      state: 'creating' as const,
      sizeLimitBytes: body.data.size_limit_bytes ?? null,
      createdAt: new Date(),
      deletedAt: null,
    };
    const operation = await libsql.commit(
      scope,
      {
        action: 'libsql.create',
        targetType: 'libsql_database',
        targetId: row.id,
      },
      [{ kind: 'libsql.insert', row }],
    );
    return c.json(
      { libsql_database: view(row), operation: toOperationResponse(operation) },
      202,
    );
  });

  v1.delete('/libsql/databases/:id', async (c) => {
    const scope = scopeOf(c);
    const row = await libsql.find(scope, c.req.param('id'));
    if (!row) return notFound(c, 'Database');
    const keepBackup = c.req.query('keep_backup') === 'true';
    const operation = await libsql.commit(
      scope,
      {
        action: 'libsql.delete',
        targetType: 'libsql_database',
        targetId: row.id,
        params: { keepBackup },
      },
      [{ kind: 'libsql.markDeleted', id: row.id }],
    );
    return c.json(
      {
        libsql_database: view({ ...row, state: 'deleting' }),
        operation: toOperationResponse(operation),
      },
      202,
    );
  });

  v1.post('/libsql/databases/:id/fork', async (c) => {
    const body = await parseBody(c, forkLibsqlDatabaseRequestSchema);
    if (!body.ok) return body.response;
    const scope = scopeOf(c);
    const source = await libsql.find(scope, c.req.param('id'));
    if (!source) return notFound(c, 'Database');
    if (source.state !== 'active') {
      return apiError(
        c,
        409,
        'conflict',
        `Database is ${source.state}; fork it once it is active`,
      );
    }
    const timestamp = body.data.timestamp;
    if (timestamp && Date.parse(timestamp) > Date.now() + FUTURE_SKEW_MS) {
      return apiError(c, 400, 'bad_request', 'timestamp is in the future');
    }
    const claim = await claimNamespace(c, body.data.name);
    if ('response' in claim) return claim.response;

    // sqld forks inside one server, so the copy lives on the source's node.
    const row = {
      id: newId('ldb'),
      consoleProjectId: scope.consoleProjectId,
      consoleOrgId: scope.orgId,
      name: body.data.name,
      namespace: claim.namespace,
      nodeId: source.nodeId,
      state: 'creating' as const,
      sizeLimitBytes: source.sizeLimitBytes,
      createdAt: new Date(),
      deletedAt: null,
    };
    const operation = await libsql.commit(
      scope,
      {
        action: 'libsql.fork',
        targetType: 'libsql_database',
        targetId: row.id,
        params: {
          sourceNamespace: source.namespace,
          ...(timestamp ? { timestamp } : {}),
        },
      },
      [{ kind: 'libsql.insert', row }],
    );
    return c.json(
      { libsql_database: view(row), operation: toOperationResponse(operation) },
      202,
    );
  });

  v1.post('/libsql/databases/:id/tokens', async (c) => {
    // An empty body means the defaults: a read-write token that never expires.
    const body = await parseOptionalBody(c, createLibsqlTokenRequestSchema);
    if (!body.ok) return body.response;
    if (!deps.libsqlSigner) {
      return unavailable(
        c,
        'not_configured',
        'This API is not configured to mint libSQL tokens',
      );
    }
    const row = await libsql.find(scopeOf(c), c.req.param('id'));
    if (!row) return notFound(c, 'Database');
    if (row.state !== 'active') {
      return apiError(
        c,
        409,
        'conflict',
        `Database is ${row.state}; tokens can be issued once it is active`,
      );
    }
    const minted = mintLibsqlToken(deps.libsqlSigner, {
      namespace: row.namespace,
      access: body.data.access,
      expiresInSeconds: body.data.expires_in_seconds,
    });
    return c.json({
      token: minted.token,
      expires_at: minted.expiresAt?.toISOString() ?? null,
    });
  });
}
