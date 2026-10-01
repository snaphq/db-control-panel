import { createBranchResponseSchema } from '@repo/control-plane-contract';
import { describe, expect, it } from 'vitest';
import { alice, bob, buildApi, call, createProject } from './api.fixture.js';

const HOUR = 3_600_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

async function setup() {
  const api = buildApi();
  const project = await createProject(api);
  const branch = (
    body: unknown,
    caller = alice,
    projectId = project.projectId,
  ) => call(api, 'POST', `/projects/${projectId}/branches`, { body, caller });
  return { api, ...project, branch };
}

describe('POST /v1/projects/:id/branches with parent_timestamp', () => {
  it('accepts a time inside the retention window and hands it to the worker in UTC', async () => {
    const t = await setup();
    const at = new Date(Date.now() - 2 * HOUR);
    const offset = '+05:30';
    const local = new Date(at.getTime() + 5.5 * HOUR)
      .toISOString()
      .replace('Z', offset);
    const accepted = await t.branch({
      name: 'earlier',
      parent_timestamp: local,
    });
    expect(accepted.status).toBe(202);
    const body = createBranchResponseSchema.parse(await accepted.json());
    // The branch has no LSN until the worker resolves the time.
    expect(body.branch.parent_lsn).toBeNull();
    expect(t.api.store.branches.get(body.branch.id)?.parentLsn).toBeNull();
    expect(t.api.store.operations.get(body.operation.id)?.params).toEqual({
      branchId: body.branch.id,
      parentTimestamp: at.toISOString(),
    });
  });

  it('accepts a time a moment ago', async () => {
    const t = await setup();
    const now = await t.branch({ name: 'now', parent_timestamp: iso(-1) });
    expect(now.status).toBe(202);
  });

  it('leaves params without a timestamp when none is given', async () => {
    const t = await setup();
    const response = await t.branch({ name: 'plain', parent_lsn: '0/16B5A50' });
    const body = createBranchResponseSchema.parse(await response.json());
    expect(t.api.store.operations.get(body.operation.id)?.params).toEqual({
      branchId: body.branch.id,
    });
  });

  it('rejects parent_timestamp together with parent_lsn', async () => {
    const t = await setup();
    const response = await t.branch({
      name: 'both',
      parent_lsn: '0/16B5A50',
      parent_timestamp: iso(-HOUR),
    });
    expect(response.status).toBe(400);
    const message = (await response.json()).error.message as string;
    expect(message).toContain('parent_timestamp');
    expect(message).toContain('not both');
    expect(t.api.store.branches.size).toBe(1);
  });

  it('rejects text that is not an ISO 8601 date-time', async () => {
    const t = await setup();
    for (const parent_timestamp of [
      'yesterday',
      '2026-03-01',
      '2026-03-01T10:00:00',
      '1767225600',
    ]) {
      const response = await t.branch({ name: 'bad', parent_timestamp });
      expect(response.status, parent_timestamp).toBe(400);
    }
  });

  it('rejects a time in the future with a clear message', async () => {
    const t = await setup();
    const future = iso(HOUR);
    const response = await t.branch({
      name: 'ahead',
      parent_timestamp: future,
    });
    expect(response.status).toBe(400);
    const error = (await response.json()).error;
    expect(error.code).toBe('bad_request');
    expect(error.message).toMatch(/parent_timestamp: .* is in the future/);
    expect(t.api.store.operations.size).toBe(1);
    expect(t.api.store.branches.size).toBe(1);
  });

  it('rejects a time older than the project history retention', async () => {
    const t = await setup();
    // The default retention is 24 hours.
    const response = await t.branch({
      name: 'ancient',
      parent_timestamp: iso(-25 * HOUR),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      'history retention of 86400 seconds',
    );
    expect(t.api.store.branches.size).toBe(1);
  });

  it('measures the window with the project own retention', async () => {
    const api = buildApi();
    const created = await call(api, 'POST', '/projects', {
      body: { name: 'short', history_retention_seconds: 600 },
    });
    const { project } = await created.json();
    for (const op of api.store.operations.values()) op.status = 'finished';
    const post = (parent_timestamp: string, name: string) =>
      call(api, 'POST', `/projects/${project.id}/branches`, {
        body: { name, parent_timestamp },
      });
    expect((await post(iso(-30 * 60_000), 'too-old')).status).toBe(400);
    expect((await post(iso(-5 * 60_000), 'inside')).status).toBe(202);
  });

  it('answers 404 for another console project, before looking at the time', async () => {
    const t = await setup();
    const response = await t.branch(
      { name: 'steal', parent_timestamp: iso(-HOUR) },
      bob,
    );
    expect(response.status).toBe(404);
    expect(t.api.store.branches.size).toBe(1);
  });
});
