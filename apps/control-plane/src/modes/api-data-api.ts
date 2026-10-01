import {
  createDataApiTokenRequestSchema,
  setDataApiJwksRequestSchema,
} from '@repo/control-plane-contract';
import type { Hono } from 'hono';
import { sealContext } from '../crypto/secretbox.js';
import { effectiveJwks, jwksSource } from '../data-api/jwks.js';
import { generateDataApiKey, signDataApiToken } from '../data-api/keys.js';
import {
  MAX_DATA_API_DATABASES,
  postgrestContainerName,
} from '../neon/compute-pod.js';
import type { DesiredStateChange } from '../neon/store.js';
import {
  type ApiContext,
  type ApiEnv,
  type NeonApiDeps,
  apiError,
  dataApiUrl,
  newPassword,
  notFound,
  parseBody,
  parseOptionalBody,
  scopeOf,
  toDatabase,
  toOperationResponse,
} from './api-support.js';

/** The JWKS ends up in a container environment variable, which Kubernetes caps well above this. */
const MAX_JWKS_BYTES = 16_000;

/**
 * Data API routes (docs-internal/platform/control-plane.mdx, "Data API"):
 *
 * - `PUT|DELETE .../databases/:db/data_api` turn it on or off for one database;
 * - `GET|PUT /projects/:project/data_api/jwks` read or replace the keys
 *   PostgREST verifies tokens with;
 * - `POST /projects/:project/data_api/token` mints a test token with the
 *   platform-issued key.
 */
export function registerDataApiRoutes(
  v1: Hono<ApiEnv>,
  deps: NeonApiDeps,
): void {
  const { store, secrets } = deps;
  const dbBase = '/projects/:project/branches/:branch/databases/:db/data_api';

  /** Loads the project, branch and database a toggle acts on, or the 404 to send. */
  async function locate(
    c: ApiContext,
    names: { project: string; branch: string; db: string },
  ) {
    const scope = scopeOf(c);
    const projectId = names.project;
    const project = await store.findProject(scope, projectId);
    if (!project) return { response: notFound(c, 'Project') };
    const branch = await store.findBranch(scope, projectId, names.branch);
    if (!branch) return { response: notFound(c, 'Branch') };
    const databases = await store.listDatabases(scope, projectId, branch.id);
    const database = databases.find((d) => d.name === names.db);
    if (!database) return { response: notFound(c, 'Database') };
    const endpoints = await store.listEndpoints(scope, projectId, {
      branchId: branch.id,
    });
    const writer = endpoints.find((e) => e.type === 'read_write') ?? null;
    return { scope, project, branch, database, databases, writer };
  }

  v1.put(dbBase, async (c) => {
    const found = await locate(c, {
      project: c.req.param('project'),
      branch: c.req.param('branch'),
      db: c.req.param('db'),
    });
    if ('response' in found) return found.response;
    const { scope, project, branch, database, databases, writer } = found;
    if (!writer) {
      return apiError(
        c,
        409,
        'conflict',
        'The branch needs a read_write endpoint to host the Data API',
      );
    }
    const roles = await store.listRoles(scope, project.id, branch.id);
    const owner = roles.find((r) => r.name === database.ownerRole);
    if (!owner?.passwordEnc) {
      return apiError(
        c,
        409,
        'conflict',
        `The password of role "${database.ownerRole}" is not stored. Reset it with POST .../roles/${database.ownerRole}/reset_password, then enable the Data API`,
      );
    }
    const container = postgrestContainerName(database.name);
    const clash = databases.find(
      (d) =>
        d.id !== database.id &&
        d.dataApiEnabled &&
        postgrestContainerName(d.name) === container,
    );
    if (clash) {
      return apiError(
        c,
        409,
        'conflict',
        `Databases "${clash.name}" and "${database.name}" would share the container name ${container}`,
      );
    }
    // The index is assigned once and never reused within a branch, so a request
    // cannot reach another database's sidecar while a pod runs an older layout.
    const used = databases.map((d) => d.dataApiIndex ?? -1);
    const index = database.dataApiIndex ?? Math.max(-1, ...used) + 1;
    if (index >= MAX_DATA_API_DATABASES) {
      return apiError(
        c,
        409,
        'conflict',
        `A branch can host the Data API for at most ${MAX_DATA_API_DATABASES} databases`,
      );
    }

    const changes: DesiredStateChange[] = [
      {
        kind: 'database.setDataApi',
        branchId: branch.id,
        name: database.name,
        enabled: true,
        index,
      },
    ];
    if (!branch.authenticatorPasswordEnc) {
      changes.push({
        kind: 'branch.setAuthenticator',
        branchId: branch.id,
        passwordEnc: secrets.seal(
          newPassword(),
          sealContext.authenticatorPassword,
        ),
      });
    }
    if (!project.dataApiJwks || !project.dataApiSigningKeyEnc) {
      const key = generateDataApiKey();
      changes.push({
        kind: 'project.setDataApiPlatformKey',
        projectId: project.id,
        jwks: key.jwks,
        signingKeyEnc: secrets.seal(
          key.privateJwk,
          sealContext.dataApiSigningKey,
        ),
      });
    }
    const operation = await store.commit(
      scope,
      {
        action: 'data_api.enable',
        targetType: 'database',
        targetId: database.id,
        params: { branchId: branch.id },
      },
      changes,
    );
    const enabled = { ...database, dataApiEnabled: true, dataApiIndex: index };
    const url = dataApiUrl(enabled, writer.id, deps.dataApiHostSuffix);
    return c.json(
      {
        database: toDatabase(enabled, url),
        data_api: { enabled: true, url },
        operation: toOperationResponse(operation),
      },
      202,
    );
  });

  v1.delete(dbBase, async (c) => {
    const found = await locate(c, {
      project: c.req.param('project'),
      branch: c.req.param('branch'),
      db: c.req.param('db'),
    });
    if ('response' in found) return found.response;
    const { scope, branch, database } = found;
    const operation = await store.commit(
      scope,
      {
        action: 'data_api.disable',
        targetType: 'database',
        targetId: database.id,
        params: { branchId: branch.id },
      },
      [
        {
          kind: 'database.setDataApi',
          branchId: branch.id,
          name: database.name,
          enabled: false,
        },
      ],
    );
    return c.json(
      {
        database: toDatabase({ ...database, dataApiEnabled: false }, null),
        data_api: { enabled: false, url: null },
        operation: toOperationResponse(operation),
      },
      202,
    );
  });

  // ---- project keys

  v1.get('/projects/:project/data_api/jwks', async (c) => {
    const project = await store.findProject(scopeOf(c), c.req.param('project'));
    if (!project) return notFound(c, 'Project');
    return c.json({
      jwks: effectiveJwks(project),
      source: jwksSource(project),
    });
  });

  v1.put('/projects/:project/data_api/jwks', async (c) => {
    const body = await parseBody(c, setDataApiJwksRequestSchema);
    if (!body.ok) return body.response;
    if (
      body.data.jwks &&
      JSON.stringify(body.data.jwks).length > MAX_JWKS_BYTES
    ) {
      return apiError(
        c,
        400,
        'bad_request',
        `jwks is larger than ${MAX_JWKS_BYTES} bytes`,
      );
    }
    const scope = scopeOf(c);
    const project = await store.findProject(scope, c.req.param('project'));
    if (!project) return notFound(c, 'Project');
    const operation = await store.commit(
      scope,
      {
        action: 'data_api.enable',
        targetType: 'project',
        targetId: project.id,
        params: { reason: 'jwks' },
      },
      [
        {
          kind: 'project.setDataApiCustomJwks',
          projectId: project.id,
          jwks: body.data.jwks,
        },
      ],
    );
    const updated = { ...project, dataApiCustomJwks: body.data.jwks };
    return c.json(
      {
        jwks: effectiveJwks(updated),
        source: jwksSource(updated),
        operation: toOperationResponse(operation),
      },
      202,
    );
  });

  v1.post('/projects/:project/data_api/token', async (c) => {
    const body = await parseOptionalBody(c, createDataApiTokenRequestSchema);
    if (!body.ok) return body.response;
    const project = await store.findProject(scopeOf(c), c.req.param('project'));
    if (!project) return notFound(c, 'Project');
    if (!project.dataApiSigningKeyEnc) {
      return apiError(
        c,
        409,
        'conflict',
        'Enable the Data API on a database first: the platform key is created then',
      );
    }
    if (project.dataApiCustomJwks) {
      return apiError(
        c,
        409,
        'conflict',
        'This project uses its own JWKS, which does not accept tokens signed with the platform key. Sign tokens with your own key, or clear the JWKS first',
      );
    }
    const { token, expiresAt } = signDataApiToken(
      secrets.open(project.dataApiSigningKeyEnc, sealContext.dataApiSigningKey),
      {
        role: body.data.role,
        sub: body.data.sub,
        expiresInSeconds: body.data.expires_in_seconds,
      },
    );
    return c.json({
      token,
      role: body.data.role,
      expires_at: expiresAt.toISOString(),
    });
  });
}
