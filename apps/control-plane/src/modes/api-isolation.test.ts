import { describe, expect, it } from 'vitest';
import {
  type Caller,
  alice,
  bob,
  buildApi,
  call,
  createProject,
  finishOperations,
} from './api.fixture.js';

/**
 * A caller is identified by the console's two headers. Whatever ids a caller
 * sends, it must never reach another organization's or console project's rows:
 * the answer is the same 404 as for an id that does not exist.
 */
describe('tenant isolation', () => {
  async function twoProjects() {
    const api = buildApi();
    const a = await createProject(api, alice, 'alice');
    const b = await createProject(api, bob, 'bob');
    const dev = await (
      await call(api, 'POST', `/projects/${a.projectId}/branches`, {
        caller: alice,
        body: { name: 'dev', endpoint: {} },
      })
    ).json();
    finishOperations(api);
    return {
      api,
      a,
      b,
      devBranchId: dev.branch.id as string,
      devEndpointId: dev.endpoints[0].id as string,
    };
  }

  /** Every route that takes ids, aimed at alice's resources. */
  function aliceRoutes(t: Awaited<ReturnType<typeof twoProjects>>) {
    const p = `/projects/${t.a.projectId}`;
    const branch = `${p}/branches/${t.a.branchId}`;
    return [
      ['GET', p],
      ['DELETE', p],
      ['GET', `${p}/branches`],
      ['GET', `${p}/branches/${t.devBranchId}`],
      ['POST', `${p}/branches`, { name: 'steal' }],
      ['DELETE', `${p}/branches/${t.devBranchId}`],
      ['GET', `${p}/endpoints/${t.a.endpointId}`],
      [
        'POST',
        `${p}/endpoints`,
        { branch_id: t.a.branchId, type: 'read_only' },
      ],
      ['PATCH', `${p}/endpoints/${t.a.endpointId}`, { compute_size: '8' }],
      ['POST', `${p}/endpoints/${t.a.endpointId}/start`],
      ['POST', `${p}/endpoints/${t.a.endpointId}/suspend`],
      ['DELETE', `${p}/endpoints/${t.a.endpointId}`],
      ['GET', `${branch}/roles`],
      ['POST', `${branch}/roles`, { name: 'intruder' }],
      ['POST', `${branch}/roles/neondb_owner/reset_password`],
      ['GET', `${branch}/databases`],
      [
        'POST',
        `${branch}/databases`,
        { name: 'loot', owner_name: 'neondb_owner' },
      ],
      ['DELETE', `${branch}/databases/neondb`],
    ] as const;
  }

  const strangers: [string, Caller][] = [
    ['another console project in another organization', bob],
    [
      'another console project in the same organization',
      { org: alice.org, project: bob.project },
    ],
    [
      'the same console project under another organization',
      { org: bob.org, project: alice.project },
    ],
  ];

  for (const [label, stranger] of strangers) {
    it(`answers 404 to everything for ${label}`, async () => {
      const t = await twoProjects();
      const operationsBefore = t.api.store.operations.size;
      const rolesBefore = t.api.store.roles.length;
      for (const [method, path, body] of aliceRoutes(t)) {
        const response = await call(t.api, method, path, {
          caller: stranger,
          body,
        });
        expect(response.status, `${method} ${path}`).toBe(404);
      }
      // Nothing was created, changed or deleted.
      expect(t.api.store.operations.size).toBe(operationsBefore);
      expect(t.api.store.roles).toHaveLength(rolesBefore);
      expect(t.api.store.projects.get(t.a.projectId)?.deletedAt).toBeNull();
      expect(t.api.store.endpoints.get(t.a.endpointId)).toMatchObject({
        computeSize: '1',
        deletedAt: null,
      });
    });
  }

  it('does not let a project read another project branch, even with a valid path of its own', async () => {
    const t = await twoProjects();
    // bob's own project id, alice's branch id
    for (const path of [
      `/projects/${t.b.projectId}/branches/${t.a.branchId}`,
      `/projects/${t.b.projectId}/branches/${t.a.branchId}/roles`,
      `/projects/${t.b.projectId}/branches/${t.a.branchId}/databases`,
      `/projects/${t.b.projectId}/endpoints/${t.a.endpointId}`,
    ]) {
      expect(
        (await call(t.api, 'GET', path, { caller: bob })).status,
        path,
      ).toBe(404);
    }
    // bob cannot attach an endpoint to alice's branch through his own project
    const attach = await call(
      t.api,
      'POST',
      `/projects/${t.b.projectId}/endpoints`,
      {
        caller: bob,
        body: { branch_id: t.a.branchId, type: 'read_only' },
      },
    );
    expect(attach.status).toBe(404);
    // nor branch from alice's branch
    const fork = await call(
      t.api,
      'POST',
      `/projects/${t.b.projectId}/branches`,
      {
        caller: bob,
        body: { name: 'fork', parent_id: t.a.branchId },
      },
    );
    expect(fork.status).toBe(404);
  });

  it('lists only the caller own resources', async () => {
    const t = await twoProjects();
    const listed = async (caller: Caller, path: string, key: string) =>
      (
        (await (await call(t.api, 'GET', path, { caller })).json())[key] as {
          id: string;
        }[]
      ).map((x) => x.id);
    expect(await listed(alice, '/projects', 'projects')).toEqual([
      t.a.projectId,
    ]);
    expect(await listed(bob, '/projects', 'projects')).toEqual([t.b.projectId]);
    expect(
      await listed(bob, `/projects/${t.b.projectId}/branches`, 'branches'),
    ).toEqual([t.b.branchId]);
    expect(
      await listed(bob, `/projects/${t.b.projectId}/endpoints`, 'endpoints'),
    ).toEqual([t.b.endpointId]);
  });

  it('keeps the caller own mutations working', async () => {
    const t = await twoProjects();
    const own = await call(
      t.api,
      'POST',
      `/projects/${t.b.projectId}/endpoints/${t.b.endpointId}/start`,
      {
        caller: bob,
      },
    );
    expect(own.status).toBe(202);
  });
});
