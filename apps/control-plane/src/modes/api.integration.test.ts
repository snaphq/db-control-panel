import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../crypto/ids.js';
import { createDatabase } from '../db/client.js';
import type { DatabaseHandle } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { createDrizzleNeonStore } from '../neon/store-drizzle.js';
import { findOperation } from '../operations/repository.js';
import { createOperationStore } from '../operations/store.js';
import { assembleApi, headersFor } from './api.fixture.js';

/**
 * The same isolation guarantees as api-isolation.test.ts, but through the real
 * SQL: every scoped query joins the owning project and filters by both console
 * ids. Needs CONTROL_PLANE_TEST_DATABASE_URL.
 */
const url = process.env.CONTROL_PLANE_TEST_DATABASE_URL;

describe.skipIf(!url)('API tenant isolation against PostgreSQL', () => {
  let handle: DatabaseHandle;

  beforeAll(async () => {
    handle = createDatabase(url as string, { max: 6 });
    await runMigrations(handle, { info: () => {} });
  });

  afterAll(async () => {
    await handle.close();
  });

  function api() {
    return assembleApi(
      createDrizzleNeonStore(handle.db, { enqueue: async () => {} }),
      (id, scope) =>
        findOperation(handle.db, id, scope.consoleProjectId, scope.orgId),
    );
  }

  const caller = () => ({
    org: `org_${newId('proj')}`,
    project: `cp_${newId('proj')}`,
  });

  async function request(
    app: ReturnType<typeof api>['app'],
    who: { org: string; project: string },
    method: string,
    path: string,
    body?: unknown,
  ) {
    return app.request(`/v1${path}`, {
      method,
      headers: headersFor(who),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function create(
    app: ReturnType<typeof api>['app'],
    who: { org: string; project: string },
  ) {
    const response = await request(app, who, 'POST', '/projects', {
      name: 'demo',
    });
    expect(response.status).toBe(202);
    const body = (await response.json()) as {
      project: { id: string };
      branch: { id: string };
      endpoints: { id: string }[];
      operation: { id: string };
    };
    await createOperationStore(handle.db).markFinished(body.operation.id);
    return {
      projectId: body.project.id,
      branchId: body.branch.id,
      endpointId: body.endpoints[0]?.id ?? '',
      operationId: body.operation.id,
    };
  }

  it('lets a caller read its own project and nobody else read it', async () => {
    const { app } = api();
    const alice = caller();
    const bob = caller();
    const a = await create(app, alice);
    const b = await create(app, bob);

    const own = [
      `/projects/${a.projectId}`,
      `/projects/${a.projectId}/branches`,
      `/projects/${a.projectId}/branches/${a.branchId}`,
      `/projects/${a.projectId}/branches/${a.branchId}/roles`,
      `/projects/${a.projectId}/branches/${a.branchId}/databases`,
      `/projects/${a.projectId}/endpoints`,
      `/projects/${a.projectId}/endpoints/${a.endpointId}`,
      `/operations/${a.operationId}`,
    ];
    const sameOrgOtherProject = { org: alice.org, project: bob.project };
    const sameProjectOtherOrg = { org: bob.org, project: alice.project };
    for (const path of own) {
      expect((await request(app, alice, 'GET', path)).status, path).toBe(200);
      for (const stranger of [bob, sameOrgOtherProject, sameProjectOtherOrg]) {
        expect(
          (await request(app, stranger, 'GET', path)).status,
          `${path} as stranger`,
        ).toBe(404);
      }
    }
    // Bob's own project id with Alice's branch and endpoint ids.
    for (const path of [
      `/projects/${b.projectId}/branches/${a.branchId}`,
      `/projects/${b.projectId}/branches/${a.branchId}/roles`,
      `/projects/${b.projectId}/endpoints/${a.endpointId}`,
    ]) {
      expect((await request(app, bob, 'GET', path)).status, path).toBe(404);
    }
  });

  it('lets no stranger mutate a project', async () => {
    const { app, store } = api();
    const alice = caller();
    const bob = caller();
    const a = await create(app, alice);
    await create(app, bob);
    const branch = `/projects/${a.projectId}/branches/${a.branchId}`;
    const attempts: [string, string, unknown?][] = [
      ['DELETE', `/projects/${a.projectId}`],
      ['POST', `/projects/${a.projectId}/branches`, { name: 'steal' }],
      ['POST', `/projects/${a.projectId}/endpoints/${a.endpointId}/start`],
      [
        'PATCH',
        `/projects/${a.projectId}/endpoints/${a.endpointId}`,
        { compute_size: '8' },
      ],
      ['POST', `${branch}/roles`, { name: 'intruder' }],
      ['POST', `${branch}/roles/neondb_owner/reset_password`],
      ['DELETE', `${branch}/databases/neondb`],
    ];
    for (const [method, path, body] of attempts) {
      expect(
        (await request(app, bob, method, path, body)).status,
        `${method} ${path}`,
      ).toBe(404);
    }
    const scope = { orgId: alice.org, consoleProjectId: alice.project };
    expect((await store.findProject(scope, a.projectId))?.deletedAt).toBeNull();
    expect(await store.listRoles(scope, a.projectId, a.branchId)).toHaveLength(
      1,
    );
    expect(
      (await store.findEndpoint(scope, a.projectId, a.endpointId))?.computeSize,
    ).toBe('1');
  });

  it('serializes mutations of one console project: the second gets 423', async () => {
    const { app } = api();
    const who = caller();
    const a = await create(app, who);
    const path = `/projects/${a.projectId}/branches/${a.branchId}/roles`;
    const results = await Promise.all([
      request(app, who, 'POST', path, { name: 'one' }),
      request(app, who, 'POST', path, { name: 'two' }),
      request(app, who, 'POST', path, { name: 'three' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([202, 423, 423]);
  });
});
