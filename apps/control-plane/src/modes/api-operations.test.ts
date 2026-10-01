import {
  type Operation,
  listOperationsResponseSchema,
} from '@repo/control-plane-contract';
import { describe, expect, it } from 'vitest';
import {
  type Api,
  type Caller,
  alice,
  bob,
  buildApi,
  call,
  createProject,
  finishOperations,
  headersFor,
} from './api.fixture.js';

const T0 = Date.parse('2026-03-01T10:00:00.000Z');

/** Gives each of the store's operations a distinct, increasing creation time. */
function spaceOut(api: Api) {
  let at = T0;
  for (const record of api.store.operations.values()) {
    record.createdAt = new Date(at);
    at += 1000;
  }
}

/** alice: project.create (finished), three more finished operations, one running. */
async function aliceHistory() {
  const api = buildApi();
  const a = await createProject(api, alice, 'alice');
  for (const name of ['one', 'two', 'three']) {
    const response = await call(
      api,
      'POST',
      `/projects/${a.projectId}/branches`,
      {
        body: { name },
      },
    );
    expect(response.status).toBe(202);
    finishOperations(api);
  }
  const running = await call(
    api,
    'POST',
    `/projects/${a.projectId}/endpoints/${a.endpointId}/start`,
  );
  expect(running.status).toBe(202);
  spaceOut(api);
  return { api, a, runningId: (await running.json()).operation.id as string };
}

async function list(
  api: Api,
  path: string,
  caller: Caller = alice,
): Promise<{ status: number; operations: Operation[]; next: string | null }> {
  const response = await call(api, 'GET', path, { caller });
  const json = await response.json();
  if (response.status !== 200)
    return { status: response.status, operations: [], next: null };
  const body = listOperationsResponseSchema.parse(json);
  return { status: 200, operations: body.operations, next: body.next_cursor };
}

describe.each([
  ['/operations', () => ''],
  [
    '/projects/:project/operations',
    (projectId: string) => `/projects/${projectId}`,
  ],
] as const)('GET %s', (_label, prefix) => {
  it('lists the console project operations, newest first, in the contract shape', async () => {
    const { api, a } = await aliceHistory();
    const { operations, next } = await list(
      api,
      `${prefix(a.projectId)}/operations`,
    );
    expect(operations.map((o) => o.action)).toEqual([
      'endpoint.start',
      'branch.create',
      'branch.create',
      'branch.create',
      'project.create',
    ]);
    expect(next).toBeNull();
    const times = operations.map((o) => o.created_at);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it('status=active returns only scheduling and running operations', async () => {
    const { api, a, runningId } = await aliceHistory();
    const active = await list(
      api,
      `${prefix(a.projectId)}/operations?status=active`,
    );
    expect(active.operations.map((o) => o.id)).toEqual([runningId]);
    expect(active.operations[0]?.status).toBe('scheduling');

    // A running operation still counts as active; a settled one does not.
    const record = api.store.operations.get(runningId);
    if (record) record.status = 'running';
    expect(
      (await list(api, `${prefix(a.projectId)}/operations?status=active`))
        .operations,
    ).toHaveLength(1);
    if (record) record.status = 'finished';
    expect(
      (await list(api, `${prefix(a.projectId)}/operations?status=active`))
        .operations,
    ).toEqual([]);
  });

  it('filters by one status', async () => {
    const { api, a } = await aliceHistory();
    const finished = await list(
      api,
      `${prefix(a.projectId)}/operations?status=finished`,
    );
    expect(finished.operations).toHaveLength(4);
    expect(new Set(finished.operations.map((o) => o.status))).toEqual(
      new Set(['finished']),
    );
    expect(
      (await list(api, `${prefix(a.projectId)}/operations?status=failed`))
        .operations,
    ).toEqual([]);
  });

  it('pages with limit and next_cursor without gaps or repeats', async () => {
    const { api, a } = await aliceHistory();
    const everything = (await list(api, `${prefix(a.projectId)}/operations`))
      .operations;
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query = `limit=2${cursor ? `&cursor=${cursor}` : ''}`;
      const page = await list(
        api,
        `${prefix(a.projectId)}/operations?${query}`,
      );
      expect(page.operations.length).toBeLessThanOrEqual(2);
      seen.push(...page.operations.map((o) => o.id));
      cursor = page.next;
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toEqual(everything.map((o) => o.id));
  });

  it('applies the status filter across pages', async () => {
    const { api, a } = await aliceHistory();
    const first = await list(
      api,
      `${prefix(a.projectId)}/operations?status=finished&limit=3`,
    );
    expect(first.operations).toHaveLength(3);
    expect(first.next).not.toBeNull();
    const second = await list(
      api,
      `${prefix(a.projectId)}/operations?status=finished&limit=3&cursor=${first.next}`,
    );
    expect(second.operations).toHaveLength(1);
    expect(second.next).toBeNull();
  });

  it('rejects an unknown status, a bad limit and a cursor that names nothing', async () => {
    const { api, a } = await aliceHistory();
    for (const query of [
      'status=pending',
      'limit=0',
      'limit=101',
      'limit=lots',
      'cursor=op_missing',
    ]) {
      const response = await call(
        api,
        'GET',
        `${prefix(a.projectId)}/operations?${query}`,
      );
      expect(response.status, query).toBe(400);
      expect((await response.json()).error.code).toBe('bad_request');
    }
  });

  it('does not show another console project or organization the operations', async () => {
    const { api, a } = await aliceHistory();
    const b = await createProject(api, bob, 'bob');
    const mine = await list(api, `${prefix(b.projectId)}/operations`, bob);
    expect(mine.operations).toHaveLength(1);
    expect(mine.operations[0]?.action).toBe('project.create');
    const aliceIds = new Set(
      (await list(api, `${prefix(a.projectId)}/operations`)).operations.map(
        (o) => o.id,
      ),
    );
    expect(mine.operations.some((o) => aliceIds.has(o.id))).toBe(false);

    for (const stranger of [
      { org: alice.org, project: bob.project },
      { org: bob.org, project: alice.project },
    ]) {
      const theirs = await list(
        api,
        `${prefix(b.projectId)}/operations?status=active`,
        stranger,
      );
      expect(theirs.operations.every((o) => !aliceIds.has(o.id))).toBe(true);
      expect(
        (await list(api, `${prefix(b.projectId)}/operations`, stranger))
          .operations,
      ).toEqual([]);
    }
  });

  it('does not accept a cursor taken from another console project', async () => {
    const { api, a } = await aliceHistory();
    const b = await createProject(api, bob, 'bob');
    const foreign = (await list(api, `${prefix(a.projectId)}/operations`))
      .operations[0];
    const response = await call(
      api,
      'GET',
      `${prefix(b.projectId)}/operations?cursor=${foreign?.id}`,
      { caller: bob },
    );
    expect(response.status).toBe(400);
  });

  it('requires the bearer token and both scope headers', async () => {
    const { api, a } = await aliceHistory();
    const path = `/v1${prefix(a.projectId)}/operations`;
    const bearer = await api.app.request(path, {
      headers: { ...headersFor(alice), authorization: 'Bearer nope' },
    });
    expect(bearer.status).toBe(401);
    for (const header of ['x-alloydb-org', 'x-alloydb-project']) {
      const partial: Record<string, string> = { ...headersFor(alice) };
      delete partial[header];
      expect((await api.app.request(path, { headers: partial })).status).toBe(
        400,
      );
    }
  });
});

describe('GET /v1/projects/:project/operations scoping', () => {
  it('answers 404 for a project of another console project or organization, or none at all', async () => {
    const { api, a } = await aliceHistory();
    const projectPath = `/projects/${a.projectId}/operations`;
    for (const stranger of [
      bob,
      { org: alice.org, project: bob.project },
      { org: bob.org, project: alice.project },
    ]) {
      expect(
        (await call(api, 'GET', projectPath, { caller: stranger })).status,
      ).toBe(404);
    }
    expect(
      (await call(api, 'GET', '/projects/proj_missing/operations')).status,
    ).toBe(404);
  });

  it('lists operations of a console project that has no Postgres project through /operations', async () => {
    const api = buildApi();
    const empty = await list(api, '/operations');
    expect(empty).toMatchObject({ status: 200, operations: [], next: null });
  });
});
