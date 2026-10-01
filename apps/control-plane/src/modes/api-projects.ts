import {
  createBranchRequestSchema,
  createProjectRequestSchema,
} from '@repo/control-plane-contract';
import type { Hono } from 'hono';
import { newEndpointId, newId, newNeonId } from '../crypto/ids.js';
import { buildScramSecret } from '../crypto/scram.js';
import { sealContext } from '../crypto/secretbox.js';
import type { DesiredStateChange } from '../neon/store.js';
import {
  type ApiEnv,
  type NeonApiDeps,
  apiError,
  newPassword,
  notFound,
  parseBody,
  scopeOf,
  toBranch,
  toDatabase,
  toEndpoint,
  toOperationResponse,
  toProject,
  toRoleWithPassword,
} from './api-support.js';

const DEFAULT_COMPUTE_SIZE = '1';
const DEFAULT_SUSPEND_TIMEOUT_SECONDS = 300;
const DEFAULT_HISTORY_RETENTION_SECONDS = 86_400;
const OWNER_ROLE = 'neondb_owner';
const DEFAULT_DATABASE = 'neondb';
const DEFAULT_BRANCH = 'main';

export function registerProjectRoutes(
  v1: Hono<ApiEnv>,
  deps: NeonApiDeps,
): void {
  const { store, pgHostSuffix, secrets } = deps;

  v1.get('/projects', async (c) => {
    const projects = await store.listProjects(scopeOf(c));
    return c.json({ projects: projects.map(toProject) });
  });

  v1.post('/projects', async (c) => {
    const body = await parseBody(c, createProjectRequestSchema);
    if (!body.ok) return body.response;
    const scope = scopeOf(c);
    if ((await store.listProjects(scope)).length > 0) {
      return apiError(
        c,
        409,
        'conflict',
        'This console project already has a database project',
      );
    }
    const now = new Date();
    const password = newPassword();
    const project = {
      id: newId('proj'),
      consoleProjectId: scope.consoleProjectId,
      consoleOrgId: scope.orgId,
      name: body.data.name,
      tenantId: newNeonId(),
      pgVersion: body.data.pg_version ?? 17,
      historyRetentionSeconds:
        body.data.history_retention_seconds ??
        DEFAULT_HISTORY_RETENTION_SECONDS,
      allowedIps: body.data.allowed_ips ?? null,
      dataApiJwks: null,
      dataApiSigningKeyEnc: null,
      dataApiCustomJwks: null,
      createdAt: now,
      deletedAt: null,
    };
    const branch = {
      id: newId('br'),
      projectId: project.id,
      name: DEFAULT_BRANCH,
      timelineId: newNeonId(),
      parentBranchId: null,
      parentLsn: null,
      safekeepers: null,
      authenticatorPasswordEnc: null,
      isDefault: true,
      createdAt: now,
      deletedAt: null,
    };
    const endpoint = {
      id: newEndpointId(),
      branchId: branch.id,
      type: 'read_write' as const,
      computeSize: body.data.compute_size ?? DEFAULT_COMPUTE_SIZE,
      suspendTimeoutSeconds:
        body.data.suspend_timeout_seconds ?? DEFAULT_SUSPEND_TIMEOUT_SECONDS,
      state: 'idle' as const,
      podName: null,
      podIp: null,
      lastActiveAt: null,
      createdAt: now,
      deletedAt: null,
    };
    const role = {
      id: newId('role'),
      branchId: branch.id,
      name: OWNER_ROLE,
      scramSecret: buildScramSecret(password),
      passwordEnc: secrets.seal(password, sealContext.rolePassword(OWNER_ROLE)),
      createdAt: now,
    };
    const database = {
      id: newId('db'),
      branchId: branch.id,
      name: DEFAULT_DATABASE,
      ownerRole: OWNER_ROLE,
      dataApiEnabled: false,
      dataApiIndex: null,
      createdAt: now,
    };
    const operation = await store.commit(
      scope,
      { action: 'project.create', targetType: 'project', targetId: project.id },
      [
        { kind: 'project.insert', row: project },
        { kind: 'branch.insert', row: branch },
        { kind: 'endpoint.insert', row: endpoint },
        { kind: 'role.insert', row: role },
        { kind: 'database.insert', row: database },
      ],
    );
    const host = `${endpoint.id}.${pgHostSuffix}`;
    return c.json(
      {
        project: toProject(project),
        branch: toBranch(branch),
        endpoints: [toEndpoint(endpoint, project.id, pgHostSuffix)],
        roles: [toRoleWithPassword(role, password)],
        databases: [toDatabase(database)],
        connection_uris: [
          {
            connection_uri: `postgresql://${OWNER_ROLE}:${encodeURIComponent(password)}@${host}/${DEFAULT_DATABASE}?sslmode=require`,
          },
        ],
        operation: toOperationResponse(operation),
      },
      202,
    );
  });

  v1.get('/projects/:project', async (c) => {
    const project = await store.findProject(scopeOf(c), c.req.param('project'));
    if (!project) return notFound(c, 'Project');
    return c.json({ project: toProject(project) });
  });

  v1.delete('/projects/:project', async (c) => {
    const scope = scopeOf(c);
    const project = await store.findProject(scope, c.req.param('project'));
    if (!project) return notFound(c, 'Project');
    const [branches, endpoints] = await Promise.all([
      store.listBranches(scope, project.id),
      store.listEndpoints(scope, project.id),
    ]);
    const operation = await store.commit(
      scope,
      { action: 'project.delete', targetType: 'project', targetId: project.id },
      [
        { kind: 'endpoint.markDeleted', ids: endpoints.map((e) => e.id) },
        { kind: 'branch.markDeleted', ids: branches.map((b) => b.id) },
        { kind: 'project.markDeleted', id: project.id },
      ],
    );
    return c.json(
      {
        project: toProject(project),
        operation: toOperationResponse(operation),
      },
      202,
    );
  });

  // ---- branches

  v1.get('/projects/:project/branches', async (c) => {
    const scope = scopeOf(c);
    const projectId = c.req.param('project');
    if (!(await store.findProject(scope, projectId)))
      return notFound(c, 'Project');
    const branches = await store.listBranches(scope, projectId);
    return c.json({ branches: branches.map(toBranch) });
  });

  v1.get('/projects/:project/branches/:branch', async (c) => {
    const branch = await store.findBranch(
      scopeOf(c),
      c.req.param('project'),
      c.req.param('branch'),
    );
    if (!branch) return notFound(c, 'Branch');
    return c.json({ branch: toBranch(branch) });
  });

  v1.post('/projects/:project/branches', async (c) => {
    const body = await parseBody(c, createBranchRequestSchema);
    if (!body.ok) return body.response;
    const scope = scopeOf(c);
    const project = await store.findProject(scope, c.req.param('project'));
    if (!project) return notFound(c, 'Project');
    const branches = await store.listBranches(scope, project.id);
    if (branches.some((b) => b.name === body.data.name)) {
      return apiError(
        c,
        409,
        'conflict',
        `Branch "${body.data.name}" already exists`,
      );
    }
    const parent = body.data.parent_id
      ? branches.find((b) => b.id === body.data.parent_id)
      : branches.find((b) => b.isDefault);
    if (!parent) return notFound(c, 'Parent branch');

    // The new timeline starts as a copy of the parent's data, so it starts with
    // the parent's roles and databases (and the same SCRAM secrets).
    const [roles, databases] = await Promise.all([
      store.listRoles(scope, project.id, parent.id),
      store.listDatabases(scope, project.id, parent.id),
    ]);
    const now = new Date();
    const branch = {
      id: newId('br'),
      projectId: project.id,
      name: body.data.name,
      timelineId: newNeonId(),
      parentBranchId: parent.id,
      parentLsn: body.data.parent_lsn ?? null,
      safekeepers: null,
      // The fork carries the parent's roles, including `authenticator`.
      authenticatorPasswordEnc: parent.authenticatorPasswordEnc,
      isDefault: false,
      createdAt: now,
      deletedAt: null,
    };
    const endpoint = body.data.endpoint && {
      id: newEndpointId(),
      branchId: branch.id,
      type: 'read_write' as const,
      computeSize: body.data.endpoint.compute_size ?? DEFAULT_COMPUTE_SIZE,
      suspendTimeoutSeconds:
        body.data.endpoint.suspend_timeout_seconds ??
        DEFAULT_SUSPEND_TIMEOUT_SECONDS,
      state: 'idle' as const,
      podName: null,
      podIp: null,
      lastActiveAt: null,
      createdAt: now,
      deletedAt: null,
    };
    const changes: DesiredStateChange[] = [
      { kind: 'branch.insert', row: branch },
      ...roles.map(
        (r): DesiredStateChange => ({
          kind: 'role.insert',
          row: { ...r, id: newId('role'), branchId: branch.id },
        }),
      ),
      ...databases.map(
        (d): DesiredStateChange => ({
          kind: 'database.insert',
          row: { ...d, id: newId('db'), branchId: branch.id },
        }),
      ),
      ...(endpoint
        ? [{ kind: 'endpoint.insert', row: endpoint } as const]
        : []),
    ];
    const operation = await store.commit(
      scope,
      {
        action: 'branch.create',
        targetType: 'branch',
        targetId: branch.id,
        params: { branchId: branch.id },
      },
      changes,
    );
    return c.json(
      {
        branch: toBranch(branch),
        endpoints: endpoint
          ? [toEndpoint(endpoint, project.id, pgHostSuffix)]
          : [],
        operation: toOperationResponse(operation),
      },
      202,
    );
  });

  v1.delete('/projects/:project/branches/:branch', async (c) => {
    const scope = scopeOf(c);
    const projectId = c.req.param('project');
    const branch = await store.findBranch(
      scope,
      projectId,
      c.req.param('branch'),
    );
    if (!branch) return notFound(c, 'Branch');
    if (branch.isDefault) {
      return apiError(
        c,
        409,
        'conflict',
        'The default branch cannot be deleted',
      );
    }
    const siblings = await store.listBranches(scope, projectId);
    const children = siblings.filter((b) => b.parentBranchId === branch.id);
    if (children.length > 0) {
      return apiError(
        c,
        409,
        'conflict',
        `Branch has child branches (${children.map((b) => b.name).join(', ')}); delete them first`,
      );
    }
    const endpoints = await store.listEndpoints(scope, projectId, {
      branchId: branch.id,
    });
    const operation = await store.commit(
      scope,
      {
        action: 'branch.delete',
        targetType: 'branch',
        targetId: branch.id,
        params: { branchId: branch.id },
      },
      [
        { kind: 'endpoint.markDeleted', ids: endpoints.map((e) => e.id) },
        { kind: 'branch.markDeleted', ids: [branch.id] },
      ],
    );
    return c.json(
      {
        branch: toBranch(branch),
        operation: toOperationResponse(operation),
      },
      202,
    );
  });
}
