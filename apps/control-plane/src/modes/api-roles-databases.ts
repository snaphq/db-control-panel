import {
  createDatabaseRequestSchema,
  createRoleRequestSchema,
} from '@repo/control-plane-contract';
import type { Hono } from 'hono';
import { newId } from '../crypto/ids.js';
import { buildScramSecret } from '../crypto/scram.js';
import { sealContext } from '../crypto/secretbox.js';
import {
  type ApiEnv,
  type NeonApiDeps,
  apiError,
  dataApiUrl,
  newPassword,
  notFound,
  parseBody,
  scopeOf,
  toDatabase,
  toOperationResponse,
  toRole,
  toRoleWithPassword,
  writerEndpointId,
} from './api-support.js';

export function registerRoleAndDatabaseRoutes(
  v1: Hono<ApiEnv>,
  deps: NeonApiDeps,
): void {
  const { store, secrets, dataApiHostSuffix } = deps;
  const base = '/projects/:project/branches/:branch';

  // ---- roles

  v1.get(`${base}/roles`, async (c) => {
    const branchId = c.req.param('branch');
    const roles = await store.listRoles(
      scopeOf(c),
      c.req.param('project'),
      branchId,
    );
    // An unknown branch lists nothing; tell the caller instead of returning [].
    if (
      roles.length === 0 &&
      !(await store.findBranch(scopeOf(c), c.req.param('project'), branchId))
    ) {
      return notFound(c, 'Branch');
    }
    return c.json({ roles: roles.map(toRole) });
  });

  v1.post(`${base}/roles`, async (c) => {
    const body = await parseBody(c, createRoleRequestSchema);
    if (!body.ok) return body.response;
    const scope = scopeOf(c);
    const projectId = c.req.param('project');
    const branch = await store.findBranch(
      scope,
      projectId,
      c.req.param('branch'),
    );
    if (!branch) return notFound(c, 'Branch');
    const existing = await store.listRoles(scope, projectId, branch.id);
    if (existing.some((r) => r.name === body.data.name)) {
      return apiError(
        c,
        409,
        'conflict',
        `Role "${body.data.name}" already exists`,
      );
    }
    const password = newPassword();
    const row = {
      id: newId('role'),
      branchId: branch.id,
      name: body.data.name,
      scramSecret: buildScramSecret(password),
      passwordEnc: secrets.seal(
        password,
        sealContext.rolePassword(body.data.name),
      ),
      createdAt: new Date(),
    };
    // Creating and resetting a role are the same work: write the row, then push
    // the spec to the running compute.
    const operation = await store.commit(
      scope,
      {
        action: 'role.reset_password',
        targetType: 'role',
        targetId: row.name,
        params: { branchId: branch.id },
      },
      [{ kind: 'role.insert', row }],
    );
    return c.json(
      {
        role: toRoleWithPassword(row, password),
        operation: toOperationResponse(operation),
      },
      202,
    );
  });

  v1.post(`${base}/roles/:role/reset_password`, async (c) => {
    const scope = scopeOf(c);
    const projectId = c.req.param('project');
    const branch = await store.findBranch(
      scope,
      projectId,
      c.req.param('branch'),
    );
    if (!branch) return notFound(c, 'Branch');
    const existing = (await store.listRoles(scope, projectId, branch.id)).find(
      (r) => r.name === c.req.param('role'),
    );
    if (!existing) return notFound(c, 'Role');
    const password = newPassword();
    const scramSecret = buildScramSecret(password);
    const operation = await store.commit(
      scope,
      {
        action: 'role.reset_password',
        targetType: 'role',
        targetId: existing.name,
        params: { branchId: branch.id },
      },
      [
        {
          kind: 'role.setSecret',
          branchId: branch.id,
          name: existing.name,
          scramSecret,
          passwordEnc: secrets.seal(
            password,
            sealContext.rolePassword(existing.name),
          ),
        },
      ],
    );
    return c.json(
      {
        role: toRoleWithPassword({ ...existing, scramSecret }, password),
        operation: toOperationResponse(operation),
      },
      202,
    );
  });

  // ---- databases

  v1.get(`${base}/databases`, async (c) => {
    const scope = scopeOf(c);
    const projectId = c.req.param('project');
    const branchId = c.req.param('branch');
    if (!(await store.findBranch(scope, projectId, branchId))) {
      return notFound(c, 'Branch');
    }
    const databases = await store.listDatabases(scope, projectId, branchId);
    const writerId = databases.some((d) => d.dataApiEnabled)
      ? await writerEndpointId(store, scope, projectId, branchId)
      : null;
    return c.json({
      databases: databases.map((d) =>
        toDatabase(d, dataApiUrl(d, writerId, dataApiHostSuffix)),
      ),
    });
  });

  v1.post(`${base}/databases`, async (c) => {
    const body = await parseBody(c, createDatabaseRequestSchema);
    if (!body.ok) return body.response;
    const scope = scopeOf(c);
    const projectId = c.req.param('project');
    const branch = await store.findBranch(
      scope,
      projectId,
      c.req.param('branch'),
    );
    if (!branch) return notFound(c, 'Branch');
    const [roles, databases] = await Promise.all([
      store.listRoles(scope, projectId, branch.id),
      store.listDatabases(scope, projectId, branch.id),
    ]);
    if (!roles.some((r) => r.name === body.data.owner_name)) {
      return apiError(
        c,
        400,
        'bad_request',
        `Owner role "${body.data.owner_name}" does not exist on this branch`,
      );
    }
    if (databases.some((d) => d.name === body.data.name)) {
      return apiError(
        c,
        409,
        'conflict',
        `Database "${body.data.name}" already exists`,
      );
    }
    const row = {
      id: newId('db'),
      branchId: branch.id,
      name: body.data.name,
      ownerRole: body.data.owner_name,
      dataApiEnabled: false,
      dataApiIndex: null,
      createdAt: new Date(),
    };
    const operation = await store.commit(
      scope,
      {
        action: 'database.create',
        targetType: 'database',
        targetId: row.id,
        params: { branchId: branch.id },
      },
      [{ kind: 'database.insert', row }],
    );
    return c.json(
      {
        database: toDatabase(row, null),
        operation: toOperationResponse(operation),
      },
      202,
    );
  });

  v1.delete(`${base}/databases/:database`, async (c) => {
    const scope = scopeOf(c);
    const projectId = c.req.param('project');
    const branch = await store.findBranch(
      scope,
      projectId,
      c.req.param('branch'),
    );
    if (!branch) return notFound(c, 'Branch');
    const existing = (
      await store.listDatabases(scope, projectId, branch.id)
    ).find((d) => d.name === c.req.param('database'));
    if (!existing) return notFound(c, 'Database');
    const writerId = existing.dataApiEnabled
      ? await writerEndpointId(store, scope, projectId, branch.id)
      : null;
    const operation = await store.commit(
      scope,
      {
        action: 'database.delete',
        targetType: 'database',
        targetId: existing.id,
        params: { branchId: branch.id, name: existing.name },
      },
      [{ kind: 'database.delete', branchId: branch.id, name: existing.name }],
    );
    return c.json(
      {
        database: toDatabase(
          existing,
          dataApiUrl(existing, writerId, dataApiHostSuffix),
        ),
        operation: toOperationResponse(operation),
      },
      202,
    );
  });
}
