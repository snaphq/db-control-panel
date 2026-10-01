import { describe, expect, it } from 'vitest';
import type { OperationAction } from '../db/schema.js';
import { createMemoryNeonStore } from '../neon/store-memory.js';
import { createMemoryOperationStore } from '../operations/memory-store.js';
import { runOperation } from '../operations/runner.js';
import { StepRegistry } from '../operations/steps.js';
import { SqldAdminError } from './admin-client.js';
import { createFakeAdmin, createFakeLibsqlKube } from './fakes.js';
import { registerLibsqlSteps } from './steps.js';
import { createMemoryLibsqlStore } from './store-memory.js';

const scope = { orgId: 'acme', consoleProjectId: 'cp_1' };
const quiet = { info: () => {}, error: () => {} };

async function setup() {
  const neon = createMemoryNeonStore();
  await neon.upsertNode({
    id: 7,
    name: 'node-7',
    tailscaleIp: '100.64.0.7',
    zone: 'az-1',
    addRoles: ['libsql'],
  });
  const store = createMemoryLibsqlStore(neon);
  const admin = createFakeAdmin();
  const kube = createFakeLibsqlKube();
  const registry = registerLibsqlSteps(new StepRegistry(), {
    store,
    admin,
    kube,
    hostSuffix: 'lite.alloydb.net',
  });
  const operations = createMemoryOperationStore();
  let counter = 0;

  async function insert(
    id: string,
    namespace: string,
    extra: { sizeLimitBytes?: number } = {},
  ) {
    const op = await neon.commit(
      scope,
      { action: 'libsql.create', targetType: 'libsql_database', targetId: id },
      [
        {
          kind: 'libsql.insert',
          row: {
            id,
            consoleProjectId: scope.consoleProjectId,
            consoleOrgId: scope.orgId,
            name: namespace.split('-')[0] ?? namespace,
            namespace,
            nodeId: 7,
            ...extra,
          },
        },
      ],
    );
    const record = neon.operations.get(op.id);
    if (record) record.status = 'finished';
  }

  async function run(
    action: OperationAction,
    targetId: string,
    params: Record<string, unknown> = {},
    final = false,
  ) {
    const id = `op_${++counter}`;
    const record = operations.add(id, action);
    record.targetId = targetId;
    record.params = params;
    return { id, ...(await attempt(id, final)) };
  }
  async function attempt(id: string, final = false) {
    try {
      const outcome = await runOperation(id, {
        store: operations,
        registry,
        isFinalAttempt: final,
        logger: quiet,
      });
      return { outcome, thrown: null as unknown };
    } catch (thrown) {
      return { outcome: 'retry' as const, thrown };
    }
  }
  return {
    neon,
    store,
    admin,
    kube,
    registry,
    insert,
    run,
    attempt,
    record: (id: string) => operations.get(id),
  };
}

describe('registry', () => {
  it('plans the three libSQL actions and shares the exposure steps', async () => {
    const t = await setup();
    const names = (a: OperationAction) =>
      t.registry.planFor(a).map((s) => s.name);
    expect(names('libsql.create')).toEqual([
      'libsql.create.namespace',
      'libsql.service',
      'libsql.route',
      'libsql.activate',
    ]);
    expect(names('libsql.fork')).toEqual([
      'libsql.fork.namespace',
      'libsql.service',
      'libsql.route',
      'libsql.activate',
    ]);
    expect(names('libsql.delete')).toEqual([
      'libsql.delete.route',
      'libsql.delete.namespace',
    ]);
  });
});

describe('libsql.create', () => {
  it('creates the namespace on the placed node, exposes it and activates it', async () => {
    const t = await setup();
    await t.insert('ldb_1', 'orders-acme', { sizeLimitBytes: 5_000_000 });
    const result = await t.run('libsql.create', 'ldb_1');
    expect(result.outcome).toBe('finished');
    expect(t.admin.calls).toEqual(['create 100.64.0.7 orders-acme']);
    expect(t.admin.lastCreate).toEqual({ maxDbSizeBytes: 5_000_000 });
    expect(t.kube.services.get(7)).toBe('100.64.0.7');
    expect(t.kube.routes.get('orders-acme')).toEqual({
      namespace: 'orders-acme',
      host: 'orders-acme.lite.alloydb.net',
      nodeId: 7,
    });
    expect((await t.store.get('ldb_1'))?.state).toBe('active');
  });

  it('leaves the size limit off when none was requested', async () => {
    const t = await setup();
    await t.insert('ldb_1', 'orders-acme');
    await t.run('libsql.create', 'ldb_1');
    expect(t.admin.lastCreate).toEqual({ maxDbSizeBytes: undefined });
  });

  it('is safe to run twice: an existing namespace and route are not an error', async () => {
    const t = await setup();
    await t.insert('ldb_1', 'orders-acme');
    expect((await t.run('libsql.create', 'ldb_1')).outcome).toBe('finished');
    const again = await t.run('libsql.create', 'ldb_1');
    expect(again.outcome).toBe('finished');
    expect(
      t.record(again.id).progress.outputs['libsql.create.namespace'],
    ).toMatchObject({ result: 'exists' });
    expect(t.admin.namespaces.size).toBe(1);
    expect(t.kube.routes.size).toBe(1);
  });

  it('retries a transient node failure and resumes after the finished step', async () => {
    const t = await setup();
    await t.insert('ldb_1', 'orders-acme');
    t.admin.failNext.set('createNamespace', null);
    const first = await t.run('libsql.create', 'ldb_1');
    expect(first.outcome).toBe('retry');
    expect(t.record(first.id).status).toBe('running');
    expect(t.kube.routes.size).toBe(0);
    const second = await t.attempt(first.id);
    expect(second.outcome).toBe('finished');
    expect(t.kube.routes.has('orders-acme')).toBe(true);
    // The create call was repeated, the later steps ran once.
    expect(t.admin.calls).toEqual([
      'create 100.64.0.7 orders-acme',
      'create 100.64.0.7 orders-acme',
    ]);
  });

  it('fails at once when sqld rejects the request', async () => {
    const t = await setup();
    await t.insert('ldb_1', 'orders-acme');
    t.admin.failNext.set('createNamespace', 400);
    const result = await t.run('libsql.create', 'ldb_1');
    expect(result.outcome).toBe('failed');
    expect(t.record(result.id).error).toMatch(/scripted failure/);
  });

  it('fails permanently when the row or its node is gone', async () => {
    const t = await setup();
    const missing = await t.run('libsql.create', 'ldb_none');
    expect(missing.outcome).toBe('failed');
    expect(t.record(missing.id).error).toMatch(/no longer exists/);

    await t.insert('ldb_2', 'x-acme');
    t.neon.nodes.clear();
    const noNode = await t.run('libsql.create', 'ldb_2');
    expect(noNode.outcome).toBe('failed');
    expect(t.record(noNode.id).error).toMatch(/unknown node 7/);
  });
});

describe('libsql.fork', () => {
  it('forks the source namespace on the same node as of the timestamp', async () => {
    const t = await setup();
    await t.insert('ldb_1', 'orders-acme');
    await t.run('libsql.create', 'ldb_1');
    await t.insert('ldb_2', 'copy-acme');
    const result = await t.run('libsql.fork', 'ldb_2', {
      sourceNamespace: 'orders-acme',
      timestamp: '2026-02-03T04:05:06Z',
    });
    expect(result.outcome).toBe('finished');
    expect(t.admin.calls.at(-1)).toBe('fork 100.64.0.7 orders-acme copy-acme');
    expect(t.admin.lastFork?.timestamp?.toISOString()).toBe(
      '2026-02-03T04:05:06.000Z',
    );
    expect(t.kube.routes.has('copy-acme')).toBe(true);
    expect((await t.store.get('ldb_2'))?.state).toBe('active');
  });

  it('forks the current state without a timestamp, and repeats safely', async () => {
    const t = await setup();
    await t.insert('ldb_1', 'orders-acme');
    await t.run('libsql.create', 'ldb_1');
    await t.insert('ldb_2', 'copy-acme');
    const params = { sourceNamespace: 'orders-acme' };
    await t.run('libsql.fork', 'ldb_2', params);
    expect(t.admin.lastFork?.timestamp).toBeUndefined();
    const again = await t.run('libsql.fork', 'ldb_2', params);
    expect(again.outcome).toBe('finished');
    expect(
      t.record(again.id).progress.outputs['libsql.fork.namespace'],
    ).toMatchObject({ result: 'exists' });
  });

  it('fails when the source namespace does not exist', async () => {
    const t = await setup();
    await t.insert('ldb_2', 'copy-acme');
    const result = await t.run('libsql.fork', 'ldb_2', {
      sourceNamespace: 'gone-acme',
    });
    expect(result.outcome).toBe('failed');
    expect(t.record(result.id).error).toMatch(/doesn't exist/);
  });

  it('rejects params the API did not write', async () => {
    const t = await setup();
    await t.insert('ldb_2', 'copy-acme');
    const result = await t.run('libsql.fork', 'ldb_2', {});
    expect(result.outcome).toBe('failed');
    expect(t.record(result.id).error).toMatch(/invalid params/);
  });
});

describe('libsql.delete', () => {
  async function created() {
    const t = await setup();
    await t.insert('ldb_1', 'orders-acme');
    await t.run('libsql.create', 'ldb_1');
    // The API marks the row deleted in the request's transaction.
    const op = await t.neon.commit(
      scope,
      {
        action: 'libsql.delete',
        targetType: 'libsql_database',
        targetId: 'ldb_1',
      },
      [{ kind: 'libsql.markDeleted', id: 'ldb_1' }],
    );
    const record = t.neon.operations.get(op.id);
    if (record) record.status = 'finished';
    return t;
  }

  it('removes the route before the namespace, and prunes the backup by default', async () => {
    const t = await created();
    t.admin.calls.length = 0;
    t.kube.calls.length = 0;
    const result = await t.run('libsql.delete', 'ldb_1');
    expect(result.outcome).toBe('finished');
    expect(t.kube.calls).toEqual(['unroute orders-acme']);
    expect(t.admin.calls).toEqual(['delete 100.64.0.7 orders-acme']);
    expect(t.admin.lastDelete).toEqual({ keepBackup: false });
    expect(t.kube.routes.size).toBe(0);
    expect(t.admin.namespaces.size).toBe(0);
  });

  it('keeps the backup when asked', async () => {
    const t = await created();
    await t.run('libsql.delete', 'ldb_1', { keepBackup: true });
    expect(t.admin.lastDelete).toEqual({ keepBackup: true });
  });

  it('is safe to repeat once everything is gone', async () => {
    const t = await created();
    await t.run('libsql.delete', 'ldb_1');
    const again = await t.run('libsql.delete', 'ldb_1');
    expect(again.outcome).toBe('finished');
    expect(
      t.record(again.id).progress.outputs['libsql.delete.namespace'],
    ).toMatchObject({ result: 'missing' });
  });

  it('retries when the node cannot be reached', async () => {
    const t = await created();
    t.admin.failNext.set('deleteNamespace', null);
    const first = await t.run('libsql.delete', 'ldb_1');
    expect(first.outcome).toBe('retry');
    expect(first.thrown).toBeInstanceOf(SqldAdminError);
    expect((await t.attempt(first.id)).outcome).toBe('finished');
  });
});
