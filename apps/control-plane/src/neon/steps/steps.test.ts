import { describe, expect, it } from 'vitest';
import { newEndpointId, newId, newNeonId } from '../../crypto/ids.js';
import type { OperationAction } from '../../db/schema.js';
import { createFakeAdmin, createFakeLibsqlKube } from '../../libsql/fakes.js';
import { createMemoryLibsqlStore } from '../../libsql/store-memory.js';
import { createMemoryOperationStore } from '../../operations/memory-store.js';
import { createStepRegistry } from '../../operations/registry.js';
import { runOperation } from '../../operations/runner.js';
import { createComputeRuntime } from '../compute-runtime.js';
import {
  createFakeClock,
  createFakeComputeCtl,
  createFakePods,
  createFakeStorcon,
  newTestSigner,
  seedProject,
} from '../fakes.js';
import { createSpecService } from '../spec-service.js';

const signer = newTestSigner();
const quiet = { info: () => {}, error: () => {} };

async function setup(seedOptions: Parameters<typeof seedProject>[1] = {}) {
  const seeded = await seedProject(undefined, seedOptions);
  const pods = createFakePods();
  const computeCtl = createFakeComputeCtl();
  const storcon = createFakeStorcon();
  const specs = createSpecService({ store: seeded.store, storcon, signer });
  const runtime = createComputeRuntime({
    store: seeded.store,
    pods,
    computeCtl,
    specs,
    signer,
    config: {
      computeImage: 'c',
      postgrestImage: 'p',
      controlPlaneUri: 'http://glue',
    },
    clock: createFakeClock(),
    timings: { wakeTimeoutMs: 30_000, pollIntervalMs: 100 },
    logger: { warn: () => {} },
  });
  const registry = createStepRegistry({
    neon: { store: seeded.store, storcon, runtime },
    libsql: {
      store: createMemoryLibsqlStore(seeded.store),
      admin: createFakeAdmin(),
      kube: createFakeLibsqlKube(),
      hostSuffix: 'lite.alloydb.net',
    },
  });
  const operations = createMemoryOperationStore();
  let counter = 0;

  /** Runs one operation the way the queue does; `attempts` caps retries. */
  async function run(
    action: OperationAction,
    targetId: string,
    params: Record<string, unknown> = {},
    options: { final?: boolean } = {},
  ) {
    const id = `op_${++counter}`;
    const record = operations.add(id, action);
    record.targetId = targetId;
    record.params = params;
    return { id, ...(await attempt(id, options.final ?? false)) };
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
  const record = (id: string) => operations.get(id);
  return {
    ...seeded,
    pods,
    computeCtl,
    storcon,
    runtime,
    registry,
    run,
    attempt,
    record,
  };
}

describe('registry', () => {
  it('has a plan for every Neon and libSQL action and none for the Data API yet', async () => {
    const t = await setup();
    const actions: OperationAction[] = [
      'project.create',
      'project.delete',
      'branch.create',
      'branch.delete',
      'endpoint.start',
      'endpoint.suspend',
      'endpoint.update',
      'role.reset_password',
      'database.create',
      'database.delete',
      'libsql.create',
      'libsql.fork',
      'libsql.delete',
    ];
    for (const action of actions) {
      expect(t.registry.planFor(action).length).toBeGreaterThan(0);
    }
    expect(() => t.registry.planFor('data_api.enable')).toThrowError(
      /No steps/,
    );
  });
});

describe('project.create', () => {
  it('creates the tenant and root timeline and stores the safekeepers', async () => {
    const t = await setup({ withoutSafekeepers: true });
    const result = await t.run('project.create', t.projectId);
    expect(result.outcome).toBe('finished');
    expect(t.storcon.calls).toEqual([
      `createTenant ${t.tenantId} 86400`,
      `createTimeline ${t.tenantId} root ${t.timelineId}`,
    ]);
    const branch = t.store.branches.get(t.branchId);
    expect(branch?.safekeepers?.generation).toBe(1);
    expect(branch?.safekeepers?.safekeepers.map((s) => s.id)).toEqual([
      1, 2, 3,
    ]);
  });

  it('resumes after the failed step without repeating the finished one', async () => {
    const t = await setup({ withoutSafekeepers: true });
    t.storcon.failNext.set('createTimeline', new Error('storcon down'));
    const first = await t.run('project.create', t.projectId);
    expect(first.outcome).toBe('retry');
    expect(t.record(first.id).progress.completedSteps).toEqual([
      'neon.project.create.tenant',
    ]);
    const second = await t.attempt(first.id);
    expect(second.outcome).toBe('finished');
    expect(
      t.storcon.calls.filter((c) => c.startsWith('createTenant')),
    ).toHaveLength(1);
    expect(t.store.branches.get(t.branchId)?.safekeepers).not.toBeNull();
  });

  it('fails when the controller returns no safekeepers', async () => {
    const t = await setup({ withoutSafekeepers: true });
    t.storcon.timelineSafekeepers = null;
    const result = await t.run(
      'project.create',
      t.projectId,
      {},
      { final: true },
    );
    expect(result.outcome).toBe('failed');
    expect(t.record(result.id).error).toMatch(/without safekeepers/);
  });

  it('gives up at once when the project is gone', async () => {
    const t = await setup();
    const result = await t.run('project.create', 'proj_missing');
    expect(result.outcome).toBe('failed');
    expect(t.record(result.id).error).toMatch(/no longer exists/);
  });
});

describe('project.delete', () => {
  it('stops every compute and deletes the tenant, using the soft-deleted rows', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    // The API soft-deleted everything before queueing the operation.
    const now = new Date();
    const project = t.store.projects.get(t.projectId);
    const branch = t.store.branches.get(t.branchId);
    const endpoint = t.store.endpoints.get(t.endpointId);
    if (project) project.deletedAt = now;
    if (branch) branch.deletedAt = now;
    if (endpoint) endpoint.deletedAt = now;

    const result = await t.run('project.delete', t.projectId);
    expect(result.outcome).toBe('finished');
    expect(t.pods.pods.size).toBe(0);
    expect(t.storcon.calls).toContain(`deleteTenant ${t.tenantId}`);
    expect(t.store.endpoints.get(t.endpointId)?.state).toBe('idle');
  });
});

describe('branch.create and branch.delete', () => {
  async function withChild(
    t: Awaited<ReturnType<typeof setup>>,
    parentLsn: string | null,
  ) {
    const childId = newId('br');
    const timelineId = newNeonId();
    const op = await t.store.commit(
      t.scope,
      { action: 'branch.create', targetType: 'branch', targetId: childId },
      [
        {
          kind: 'branch.insert',
          row: {
            id: childId,
            projectId: t.projectId,
            name: 'dev',
            timelineId,
            parentBranchId: t.branchId,
            parentLsn,
          },
        },
      ],
    );
    const stored = t.store.operations.get(op.id);
    if (stored) stored.status = 'finished';
    return { childId, timelineId };
  }

  it('branches from the parent timeline at the requested LSN', async () => {
    const t = await setup();
    const child = await withChild(t, '0/16B5A50');
    const result = await t.run('branch.create', child.childId);
    expect(result.outcome).toBe('finished');
    expect(t.storcon.calls).toEqual([
      `createTimeline ${t.tenantId} branch ${child.timelineId} from ${t.timelineId} @ 0/16B5A50`,
    ]);
    const row = t.store.branches.get(child.childId);
    expect(row?.safekeepers?.generation).toBe(1);
    expect(row?.parentLsn).toBe('0/16B5A50');
  });

  it('records where the branch forked when no LSN was requested', async () => {
    const t = await setup();
    const child = await withChild(t, null);
    await t.run('branch.create', child.childId);
    expect(t.store.branches.get(child.childId)?.parentLsn).toBe('0/1000000');
    expect(t.storcon.calls[0]).toContain('@ latest');
  });

  it('fails without retrying when the branch disappeared', async () => {
    const t = await setup();
    const result = await t.run('branch.create', 'br_missing');
    expect(result.outcome).toBe('failed');
  });

  it('stops the branch computes and deletes its timeline', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    const branch = t.store.branches.get(t.branchId);
    const endpoint = t.store.endpoints.get(t.endpointId);
    if (branch) branch.deletedAt = new Date();
    if (endpoint) endpoint.deletedAt = new Date();
    const result = await t.run('branch.delete', t.branchId);
    expect(result.outcome).toBe('finished');
    expect(t.pods.pods.size).toBe(0);
    expect(t.storcon.calls.filter((c) => c.startsWith('delete'))).toEqual([
      `deleteTimeline ${t.tenantId} ${t.timelineId}`,
    ]);
  });
});

describe('endpoint operations', () => {
  it('endpoint.start wakes the compute', async () => {
    const t = await setup();
    const result = await t.run('endpoint.start', t.endpointId);
    expect(result.outcome).toBe('finished');
    expect(t.store.endpoints.get(t.endpointId)?.state).toBe('running');
    expect(
      t.record(result.id).progress.outputs['neon.endpoint.start.wake'],
    ).toEqual({
      podIp: '10.42.0.10',
      coldStart: true,
    });
  });

  it('endpoint.start is a final failure for an unknown endpoint', async () => {
    const t = await setup();
    const result = await t.run('endpoint.start', newEndpointId());
    expect(result.outcome).toBe('failed');
  });

  it('endpoint.suspend stops a running compute and is a no-op when repeated', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    expect((await t.run('endpoint.suspend', t.endpointId)).outcome).toBe(
      'finished',
    );
    expect(t.pods.pods.size).toBe(0);
    expect((await t.run('endpoint.suspend', t.endpointId)).outcome).toBe(
      'finished',
    );
  });

  it('endpoint.update without a restart pushes the spec to the running compute', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    const endpoint = t.store.endpoints.get(t.endpointId);
    if (endpoint) endpoint.suspendTimeoutSeconds = 900;
    await t.run('endpoint.update', t.endpointId, { restart: false });
    expect(
      t.computeCtl.configured[0]?.config.spec.suspend_timeout_seconds,
    ).toBe(900);
    expect(t.pods.created).toHaveLength(1);
  });

  it('endpoint.update with a new size replaces the pod', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    const endpoint = t.store.endpoints.get(t.endpointId);
    if (endpoint) endpoint.computeSize = '2';
    const result = await t.run('endpoint.update', t.endpointId, {
      restart: true,
    });
    expect(result.outcome).toBe('finished');
    expect(t.pods.created).toHaveLength(2);
    const pod = t.pods.pods.get(`compute-${t.endpointId}`);
    expect(pod?.spec?.containers[0]?.resources?.limits).toEqual({
      cpu: '2000m',
      memory: '8192Mi',
    });
  });

  it('endpoint.update leaves an idle endpoint idle', async () => {
    const t = await setup();
    const result = await t.run('endpoint.update', t.endpointId, {
      restart: true,
    });
    expect(result.outcome).toBe('finished');
    expect(t.pods.created).toEqual([]);
    expect(t.store.endpoints.get(t.endpointId)?.state).toBe('idle');
  });

  it('endpoint.update still restarts after a failed start is retried', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    t.pods.finalPhase = 'Failed';
    const first = await t.run('endpoint.update', t.endpointId, {
      restart: true,
    });
    expect(first.outcome).toBe('retry');
    expect(t.record(first.id).progress.completedSteps).toEqual([
      'neon.endpoint.update.stop',
    ]);
    t.pods.finalPhase = 'Running';
    expect((await t.attempt(first.id)).outcome).toBe('finished');
    expect(t.store.endpoints.get(t.endpointId)?.state).toBe('running');
  });
});

describe('role and database operations', () => {
  it('role.reset_password pushes the new secret to a running compute', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    const role = t.store.roles.find((r) => r.name === 'neondb_owner');
    if (role) role.scramSecret = 'SCRAM-SHA-256$4096:bmV3$a2V5:c2s=';
    const result = await t.run('role.reset_password', 'neondb_owner', {
      branchId: t.branchId,
    });
    expect(result.outcome).toBe('finished');
    expect(
      t.computeCtl.configured[0]?.config.spec.cluster.roles[0]
        ?.encrypted_password,
    ).toBe('SCRAM-SHA-256$4096:bmV3$a2V5:c2s=');
    expect(t.record(result.id).progress.outputs['neon.role.apply']).toEqual({
      applied: 1,
    });
  });

  it('role.reset_password leaves idle computes for their next start', async () => {
    const t = await setup();
    const result = await t.run('role.reset_password', 'neondb_owner', {
      branchId: t.branchId,
    });
    expect(result.outcome).toBe('finished');
    expect(t.computeCtl.configured).toEqual([]);
    expect(t.pods.created).toEqual([]);
  });

  it('rejects an operation whose params the API did not write', async () => {
    const t = await setup();
    const result = await t.run('role.reset_password', 'neondb_owner', {});
    expect(result.outcome).toBe('failed');
    expect(t.record(result.id).error).toMatch(/invalid params/);
  });

  it('database.create reconfigures a running compute with the new database', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    t.store.databases.push({
      id: newId('db'),
      branchId: t.branchId,
      name: 'analytics',
      ownerRole: 'neondb_owner',
      dataApiEnabled: false,
      dataApiIndex: null,
      createdAt: new Date(),
    });
    const result = await t.run('database.create', 'analytics', {
      branchId: t.branchId,
    });
    expect(result.outcome).toBe('finished');
    expect(
      t.computeCtl.configured[0]?.config.spec.cluster.databases.map(
        (d) => d.name,
      ),
    ).toEqual(['neondb', 'analytics']);
  });

  it('database.delete wakes an idle compute and drops the database with delete_db', async () => {
    const t = await setup();
    const result = await t.run('database.delete', 'old', {
      branchId: t.branchId,
      name: 'old',
    });
    expect(result.outcome).toBe('finished');
    expect(t.pods.created).toHaveLength(1);
    const push = t.computeCtl.configured[0];
    expect(push?.config.spec.delta_operations).toEqual([
      { action: 'delete_db', name: 'old', new_name: null },
    ]);
    expect(
      t.record(result.id).progress.outputs['neon.database.delete.drop'],
    ).toEqual({
      dropped: true,
      endpointId: t.endpointId,
    });
  });

  it('database.delete has nothing to do without a read_write endpoint', async () => {
    const t = await setup();
    const endpoint = t.store.endpoints.get(t.endpointId);
    if (endpoint) endpoint.deletedAt = new Date();
    const result = await t.run('database.delete', 'old', {
      branchId: t.branchId,
      name: 'old',
    });
    expect(result.outcome).toBe('finished');
    expect(t.pods.created).toEqual([]);
    expect(
      t.record(result.id).progress.outputs['neon.database.delete.drop'],
    ).toMatchObject({
      dropped: false,
    });
  });
});
