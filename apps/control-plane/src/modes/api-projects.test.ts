import {
  branchResponseSchema,
  createBranchResponseSchema,
  createProjectResponseSchema,
  deleteBranchResponseSchema,
  deleteProjectResponseSchema,
  listBranchesResponseSchema,
  listProjectsResponseSchema,
  projectResponseSchema,
} from '@repo/control-plane-contract';
import { describe, expect, it } from 'vitest';
import { buildScramSecret } from '../crypto/scram.js';
import {
  alice,
  bob,
  buildApi,
  call,
  createProject,
  finishOperations,
} from './api.fixture.js';

describe('POST /v1/projects', () => {
  it('creates the project rows and one operation, and returns the owner password once', async () => {
    const api = buildApi();
    const response = await call(api, 'POST', '/projects', {
      body: {
        name: 'Demo',
        compute_size: '0.5',
        suspend_timeout_seconds: 600,
        allowed_ips: ['203.0.113.0/24'],
      },
    });
    expect(response.status).toBe(202);
    const body = createProjectResponseSchema.parse(await response.json());

    expect(body.operation).toMatchObject({
      action: 'project.create',
      status: 'scheduling',
      target_id: body.project.id,
    });
    expect(body.project).toMatchObject({
      name: 'Demo',
      pg_version: 17,
      history_retention_seconds: 86_400,
      allowed_ips: ['203.0.113.0/24'],
    });
    expect(body.branch).toMatchObject({
      name: 'main',
      is_default: true,
      parent_id: null,
    });
    expect(body.endpoints[0]).toMatchObject({
      type: 'read_write',
      compute_size: '0.5',
      suspend_timeout_seconds: 600,
      state: 'idle',
    });
    expect(body.endpoints[0]?.host).toBe(
      `${body.endpoints[0]?.id}.pg.alloydb.net`,
    );
    expect(body.databases[0]).toMatchObject({
      name: 'neondb',
      owner_name: 'neondb_owner',
    });
    expect(body.roles[0]?.name).toBe('neondb_owner');

    // The tenant and timeline ids are Neon ids, ready for the worker.
    const row = api.store.projects.get(body.project.id);
    expect(row?.tenantId).toMatch(/^[0-9a-f]{32}$/);
    expect(row?.consoleProjectId).toBe(alice.project);
    expect(row?.consoleOrgId).toBe(alice.org);
    expect([...api.store.branches.values()][0]?.timelineId).toMatch(
      /^[0-9a-f]{32}$/,
    );
    expect(api.store.operations.size).toBe(1);
  });

  it('stores only a SCRAM secret that matches the returned password', async () => {
    const api = buildApi();
    const { body, password } = await createProject(api);
    const stored = api.store.roles[0]?.scramSecret ?? '';
    expect(stored).toMatch(/^SCRAM-SHA-256\$4096:/);
    expect(
      JSON.stringify([...api.store.projects.values(), ...api.store.roles]),
    ).not.toContain(password);
    const salt = Buffer.from(
      stored.split('$')[1]?.split(':')[1] ?? '',
      'base64',
    );
    expect(buildScramSecret(password, { salt })).toBe(stored);
    expect(body.connection_uris[0].connection_uri).toBe(
      `postgresql://neondb_owner:${encodeURIComponent(password)}@${body.endpoints[0].host}/neondb?sslmode=require`,
    );
  });

  it('rejects invalid bodies with every problem named', async () => {
    const api = buildApi();
    const response = await call(api, 'POST', '/projects', {
      body: { name: '', compute_size: '3', suspend_timeout_seconds: -5 },
    });
    expect(response.status).toBe(400);
    const message = (await response.json()).error.message as string;
    expect(message).toContain('name');
    expect(message).toContain('compute_size');
    expect(message).toContain('suspend_timeout_seconds');
    expect(api.store.operations.size).toBe(0);

    const garbage = await api.app.request('/v1/projects', {
      method: 'POST',
      headers: {
        authorization: 'Bearer api-token',
        'x-alloydb-org': 'o',
        'x-alloydb-project': 'p',
      },
      body: 'not json',
    });
    expect(garbage.status).toBe(400);
  });

  it('allows one project per console project', async () => {
    const api = buildApi();
    await createProject(api);
    const again = await call(api, 'POST', '/projects', {
      body: { name: 'second' },
    });
    expect(again.status).toBe(409);
    // Another console project is unaffected.
    expect(
      (
        await call(api, 'POST', '/projects', {
          caller: bob,
          body: { name: 'bob' },
        })
      ).status,
    ).toBe(202);
  });

  it('answers 423 while the project has an operation in flight', async () => {
    const api = buildApi();
    const { projectId, branchId } = await createProject(api);
    const first = await call(
      api,
      'POST',
      `/projects/${projectId}/branches/${branchId}/roles`,
      {
        body: { name: 'app' },
      },
    );
    expect(first.status).toBe(202);
    const second = await call(
      api,
      'POST',
      `/projects/${projectId}/branches/${branchId}/roles`,
      {
        body: { name: 'other' },
      },
    );
    expect(second.status).toBe(423);
    expect((await second.json()).error.code).toBe('locked');
    // Reads still work.
    expect((await call(api, 'GET', `/projects/${projectId}`)).status).toBe(200);
    finishOperations(api);
    expect(
      (
        await call(
          api,
          'POST',
          `/projects/${projectId}/branches/${branchId}/roles`,
          { body: { name: 'other' } },
        )
      ).status,
    ).toBe(202);
  });
});

describe('projects: read and delete', () => {
  it('lists and gets only the caller project', async () => {
    const api = buildApi();
    const mine = await createProject(api, alice, 'mine');
    await createProject(api, bob, 'theirs');
    const list = listProjectsResponseSchema.parse(
      await (await call(api, 'GET', '/projects')).json(),
    );
    expect(list.projects.map((p) => p.name)).toEqual(['mine']);
    const one = projectResponseSchema.parse(
      await (await call(api, 'GET', `/projects/${mine.projectId}`)).json(),
    );
    expect(one.project.id).toBe(mine.projectId);
    expect((await call(api, 'GET', '/projects/proj_unknown')).status).toBe(404);
  });

  it('marks the project, its branches and endpoints deleted and queues the cleanup', async () => {
    const api = buildApi();
    const { projectId, branchId, endpointId } = await createProject(api);
    const response = await call(api, 'DELETE', `/projects/${projectId}`);
    expect(response.status).toBe(202);
    const body = deleteProjectResponseSchema.parse(await response.json());
    expect(body.operation).toMatchObject({
      action: 'project.delete',
      target_id: projectId,
    });
    expect(api.store.projects.get(projectId)?.deletedAt).not.toBeNull();
    expect(api.store.branches.get(branchId)?.deletedAt).not.toBeNull();
    expect(api.store.endpoints.get(endpointId)?.deletedAt).not.toBeNull();

    finishOperations(api);
    expect((await call(api, 'GET', `/projects/${projectId}`)).status).toBe(404);
    expect((await call(api, 'DELETE', `/projects/${projectId}`)).status).toBe(
      404,
    );
    // The console project can host a new database project again.
    expect(
      (await call(api, 'POST', '/projects', { body: { name: 'again' } }))
        .status,
    ).toBe(202);
  });
});

describe('branches', () => {
  it('lists and gets branches', async () => {
    const api = buildApi();
    const { projectId, branchId } = await createProject(api);
    const list = listBranchesResponseSchema.parse(
      await (await call(api, 'GET', `/projects/${projectId}/branches`)).json(),
    );
    expect(list.branches.map((b) => b.id)).toEqual([branchId]);
    const one = branchResponseSchema.parse(
      await (
        await call(api, 'GET', `/projects/${projectId}/branches/${branchId}`)
      ).json(),
    );
    expect(one.branch.is_default).toBe(true);
    expect(
      (await call(api, 'GET', `/projects/${projectId}/branches/br_unknown`))
        .status,
    ).toBe(404);
  });

  it('creates a child of the default branch with its roles and databases', async () => {
    const api = buildApi();
    const { projectId, branchId } = await createProject(api);
    const response = await call(
      api,
      'POST',
      `/projects/${projectId}/branches`,
      {
        body: {
          name: 'dev',
          parent_lsn: '0/16B5A50',
          endpoint: { compute_size: '2' },
        },
      },
    );
    expect(response.status).toBe(202);
    const body = createBranchResponseSchema.parse(await response.json());
    expect(body.branch).toMatchObject({
      name: 'dev',
      parent_id: branchId,
      parent_lsn: '0/16B5A50',
      is_default: false,
    });
    expect(body.endpoints[0]).toMatchObject({
      branch_id: body.branch.id,
      compute_size: '2',
      type: 'read_write',
    });
    expect(body.operation).toMatchObject({
      action: 'branch.create',
      target_id: body.branch.id,
    });

    const row = api.store.branches.get(body.branch.id);
    expect(row?.timelineId).toMatch(/^[0-9a-f]{32}$/);
    expect(row?.timelineId).not.toBe(
      api.store.branches.get(branchId)?.timelineId,
    );
    expect(api.store.operations.get(body.operation.id)?.params).toEqual({
      branchId: body.branch.id,
    });
    const copied = api.store.roles.filter((r) => r.branchId === body.branch.id);
    expect(copied.map((r) => r.name)).toEqual(['neondb_owner']);
    expect(copied[0]?.scramSecret).toBe(
      api.store.roles.find((r) => r.branchId === branchId)?.scramSecret,
    );
    expect(
      api.store.databases
        .filter((d) => d.branchId === body.branch.id)
        .map((d) => d.name),
    ).toEqual(['neondb']);
  });

  it('branches from an explicit parent without creating an endpoint by default', async () => {
    const api = buildApi();
    const { projectId } = await createProject(api);
    const dev = createBranchResponseSchema.parse(
      await (
        await call(api, 'POST', `/projects/${projectId}/branches`, {
          body: { name: 'dev' },
        })
      ).json(),
    );
    finishOperations(api);
    expect(dev.endpoints).toEqual([]);
    const child = createBranchResponseSchema.parse(
      await (
        await call(api, 'POST', `/projects/${projectId}/branches`, {
          body: { name: 'dev-2', parent_id: dev.branch.id },
        })
      ).json(),
    );
    expect(child.branch.parent_id).toBe(dev.branch.id);
  });

  it('rejects duplicate names, unknown parents and malformed LSNs', async () => {
    const api = buildApi();
    const { projectId } = await createProject(api);
    expect(
      (
        await call(api, 'POST', `/projects/${projectId}/branches`, {
          body: { name: 'main' },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call(api, 'POST', `/projects/${projectId}/branches`, {
          body: { name: 'x', parent_id: 'br_none' },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(api, 'POST', `/projects/${projectId}/branches`, {
          body: { name: 'x', parent_lsn: 'nope' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(api, 'POST', '/projects/proj_none/branches', {
          body: { name: 'x' },
        })
      ).status,
    ).toBe(404);
  });

  it('refuses to delete the default branch or a branch with children', async () => {
    const api = buildApi();
    const { projectId, branchId } = await createProject(api);
    const del = (id: string) =>
      call(api, 'DELETE', `/projects/${projectId}/branches/${id}`);
    expect((await del(branchId)).status).toBe(409);
    const dev = createBranchResponseSchema.parse(
      await (
        await call(api, 'POST', `/projects/${projectId}/branches`, {
          body: { name: 'dev' },
        })
      ).json(),
    );
    finishOperations(api);
    await call(api, 'POST', `/projects/${projectId}/branches`, {
      body: { name: 'dev-2', parent_id: dev.branch.id },
    });
    finishOperations(api);
    const refused = await del(dev.branch.id);
    expect(refused.status).toBe(409);
    expect((await refused.json()).error.message).toContain('dev-2');
  });

  it('deletes a leaf branch and its endpoints', async () => {
    const api = buildApi();
    const { projectId } = await createProject(api);
    const dev = createBranchResponseSchema.parse(
      await (
        await call(api, 'POST', `/projects/${projectId}/branches`, {
          body: { name: 'dev', endpoint: {} },
        })
      ).json(),
    );
    finishOperations(api);
    const response = await call(
      api,
      'DELETE',
      `/projects/${projectId}/branches/${dev.branch.id}`,
    );
    expect(response.status).toBe(202);
    const body = deleteBranchResponseSchema.parse(await response.json());
    expect(body.operation).toMatchObject({
      action: 'branch.delete',
      target_id: dev.branch.id,
    });
    expect(api.store.branches.get(dev.branch.id)?.deletedAt).not.toBeNull();
    expect(
      api.store.endpoints.get(dev.endpoints[0]?.id ?? '')?.deletedAt,
    ).not.toBeNull();
    finishOperations(api);
    expect(
      (
        await call(
          api,
          'GET',
          `/projects/${projectId}/branches/${dev.branch.id}`,
        )
      ).status,
    ).toBe(404);
  });
});
