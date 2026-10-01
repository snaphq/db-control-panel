import { describe, expect, it } from 'vitest';
import {
  ComputeStartError,
  EndpointBusyError,
  WakeTimeoutError,
  createComputeRuntime,
} from './compute-runtime.js';
import {
  type FakeComputeCtl,
  createFakeClock,
  createFakeComputeCtl,
  createFakePods,
  createFakeStorcon,
  newTestSigner,
  seedProject,
} from './fakes.js';
import { EndpointNotFoundError, createSpecService } from './spec-service.js';
import { SpecNotReadyError } from './spec.js';
import { createMemoryNeonStore } from './store-memory.js';

const signer = newTestSigner();

async function setup() {
  const seeded = await seedProject();
  const pods = createFakePods();
  const computeCtl = createFakeComputeCtl();
  const storcon = createFakeStorcon();
  const clock = createFakeClock();
  const warnings: string[] = [];
  const build = () =>
    createComputeRuntime({
      store: seeded.store,
      pods,
      computeCtl,
      specs: createSpecService({ store: seeded.store, storcon, signer }),
      signer,
      config: {
        computeImage: 'ghcr.io/snaphq/neon-compute-v17:test',
        postgrestImage: 'ghcr.io/snaphq/postgrest:test',
        controlPlaneUri: 'http://neon-glue.alloydb-system:8080',
      },
      timings: {
        wakeTimeoutMs: 60_000,
        pollIntervalMs: 100,
        startStaleMs: 600_000,
      },
      clock,
      logger: { warn: (m) => warnings.push(m) },
    });
  const runtime = build();
  const podName = `compute-${seeded.endpointId}`;
  const state = () => seeded.store.endpoints.get(seeded.endpointId);
  return {
    ...seeded,
    pods,
    computeCtl,
    storcon,
    clock,
    runtime,
    build,
    podName,
    warnings,
    state,
  };
}

describe('wake', () => {
  it('creates the pod, waits for compute_ctl, and records the running endpoint', async () => {
    const t = await setup();
    t.computeCtl.unreachablePolls = 2;
    const result = await t.runtime.wake(t.endpointId);
    expect(result).toEqual({
      podName: t.podName,
      podIp: '10.42.0.10',
      coldStart: true,
    });
    expect(t.pods.created).toEqual([t.podName]);
    expect(t.state()).toMatchObject({
      state: 'running',
      podName: t.podName,
      podIp: '10.42.0.10',
    });
    expect(t.state()?.lastActiveAt).toEqual(t.clock.now());
  });

  it('gives the pod the endpoint labels and a spec token for exactly this endpoint', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    const pod = t.pods.pods.get(t.podName);
    expect(pod?.metadata?.labels).toMatchObject({
      'alloydb.net/endpoint': t.endpointId,
      'alloydb.net/project': t.projectId,
    });
    const token = pod?.spec?.containers[0]?.env?.[0]?.value ?? '';
    expect(signer.verify(token)).toMatchObject({
      scope: 'tenantendpoint',
      tenant_id: t.tenantId,
      compute_id: t.endpointId,
    });
  });

  it('answers warm when the compute is already running', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    const again = await t.runtime.wake(t.endpointId);
    expect(again.coldStart).toBe(false);
    expect(t.pods.created).toHaveLength(1);
  });

  it('shares one start between concurrent callers in a process', async () => {
    const t = await setup();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => t.runtime.wake(t.endpointId)),
    );
    expect(t.pods.created).toHaveLength(1);
    expect(results.every((r) => r.podIp === '10.42.0.10')).toBe(true);
  });

  it('starts once across processes: the database claim serializes them', async () => {
    const t = await setup();
    const other = t.build(); // a second neon-glue replica: same store, own in-flight map
    const [a, b, c] = await Promise.all([
      t.runtime.wake(t.endpointId),
      other.wake(t.endpointId),
      t.build().wake(t.endpointId),
    ]);
    expect(t.pods.created).toHaveLength(1);
    expect([a, b, c].filter((r) => r.coldStart)).toHaveLength(1);
    expect(new Set([a.podIp, b.podIp, c.podIp])).toEqual(
      new Set(['10.42.0.10']),
    );
  });

  it('waits for a suspension in progress and then starts again', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    const suspended = t.state();
    if (suspended) suspended.state = 'suspending';
    // Another process finishes the suspension a moment later.
    setTimeout(() => {
      t.pods.pods.delete(t.podName);
      void t.store.markEndpointIdle(t.endpointId);
    }, 0);
    const result = await t.runtime.wake(t.endpointId);
    expect(result.coldStart).toBe(true);
    expect(t.pods.created).toEqual([t.podName, t.podName]);
  });

  it('replaces a pod that died while the row still says running', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    t.pods.pods.delete(t.podName);
    const result = await t.runtime.wake(t.endpointId);
    expect(result.coldStart).toBe(true);
    expect(t.pods.created).toHaveLength(2);
  });

  it('replaces a failed pod left behind by a previous attempt', async () => {
    const t = await setup();
    t.pods.pods.set(t.podName, {
      metadata: { name: t.podName },
      status: { phase: 'Failed' },
    });
    t.pods.terminatingFor.set(t.podName, 2);
    const result = await t.runtime.wake(t.endpointId);
    expect(result.coldStart).toBe(true);
    expect(t.pods.deleted).toContain(t.podName);
  });

  it('adopts a pod an earlier attempt of the same start already created', async () => {
    const t = await setup();
    t.pods.pods.set(t.podName, { metadata: { name: t.podName } });
    const result = await t.runtime.wake(t.endpointId);
    expect(result.coldStart).toBe(true);
    expect(t.pods.created).toEqual([]);
  });

  it('takes over a start abandoned by a crashed process, but not a fresh one', async () => {
    const t = await setup();
    await t.store.claimEndpointState(t.endpointId, ['idle'], 'starting', {
      now: new Date(t.clock.now().getTime() - 3_600_000),
    });
    await expect(t.runtime.wake(t.endpointId)).resolves.toMatchObject({
      coldStart: true,
    });

    const fresh = await setup();
    await fresh.store.claimEndpointState(
      fresh.endpointId,
      ['idle'],
      'starting',
      {
        now: fresh.clock.now(),
      },
    );
    await expect(fresh.runtime.wake(fresh.endpointId)).rejects.toBeInstanceOf(
      WakeTimeoutError,
    );
    expect(fresh.pods.created).toEqual([]);
  });

  it('cleans up and goes back to idle when compute_ctl reports failed', async () => {
    const t = await setup();
    t.computeCtl.statuses.set('10.42.0.10', {
      status: 'failed',
      lastActive: null,
      error: 'could not reach the pageserver',
    });
    await expect(t.runtime.wake(t.endpointId)).rejects.toThrowError(
      /compute_ctl reports failed: could not reach the pageserver/,
    );
    expect(t.pods.pods.size).toBe(0);
    expect(t.state()).toMatchObject({ state: 'idle', podIp: null });
    // A later wake gets a clean start.
    t.computeCtl.statuses.clear();
    await expect(t.runtime.wake(t.endpointId)).resolves.toMatchObject({
      coldStart: true,
    });
  });

  it('fails fast when the pod crashes', async () => {
    const t = await setup();
    t.pods.finalPhase = 'Failed';
    await expect(t.runtime.wake(t.endpointId)).rejects.toBeInstanceOf(
      ComputeStartError,
    );
    expect(t.state()?.state).toBe('idle');
  });

  it('times out with the reason when the pod never gets an IP', async () => {
    const t = await setup();
    t.pods.pendingPolls = Number.POSITIVE_INFINITY;
    t.pods.pods.set(t.podName, {
      metadata: { name: t.podName },
      status: {
        phase: 'Pending',
        containerStatuses: [
          {
            name: 'compute',
            image: 'x',
            imageID: '',
            ready: false,
            restartCount: 0,
            state: { waiting: { reason: 'ImagePullBackOff' } },
          },
        ],
      },
    });
    const error = await t.runtime.wake(t.endpointId).catch((e) => e);
    expect(error).toBeInstanceOf(WakeTimeoutError);
    expect(error.message).toContain('ImagePullBackOff');
    expect(t.state()?.state).toBe('idle');
    expect(t.pods.pods.size).toBe(0);
  });

  it('does not create a pod when the spec cannot be built yet', async () => {
    const t = await setup();
    const branch = t.store.branches.get(t.branchId);
    if (branch) branch.safekeepers = null;
    await expect(t.runtime.wake(t.endpointId)).rejects.toBeInstanceOf(
      SpecNotReadyError,
    );
    expect(t.pods.created).toEqual([]);
    expect(t.state()?.state).toBe('idle');
  });

  it('does not know deleted or unknown endpoints', async () => {
    const t = await setup();
    await expect(t.runtime.wake('ep-no-such-00000000')).rejects.toBeInstanceOf(
      EndpointNotFoundError,
    );
    const endpoint = t.state();
    if (endpoint) endpoint.deletedAt = new Date();
    await expect(t.runtime.wake(t.endpointId)).rejects.toBeInstanceOf(
      EndpointNotFoundError,
    );
  });

  it('adds the Data API containers the sidecar provider returns', async () => {
    const t = await setup();
    const runtime = createComputeRuntime({
      store: t.store,
      pods: t.pods,
      computeCtl: t.computeCtl,
      specs: createSpecService({ store: t.store, storcon: t.storcon, signer }),
      signer,
      config: {
        computeImage: 'c',
        postgrestImage: 'p',
        controlPlaneUri: 'http://glue',
      },
      sidecars: async () => [
        {
          database: 'neondb',
          index: 0,
          dbUri: 'postgres://a',
          jwtSecret: '{}',
        },
      ],
      clock: t.clock,
      logger: { warn: () => {} },
    });
    await runtime.wake(t.endpointId);
    expect(
      t.pods.pods.get(t.podName)?.spec?.containers.map((c) => c.name),
    ).toEqual(['compute', 'pgbouncer', 'postgrest-neondb']);
  });
});

describe('suspend', () => {
  it('terminates the compute, deletes the pod and returns the endpoint to idle', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    expect(await t.runtime.suspend(t.endpointId)).toBe('suspended');
    expect(t.computeCtl.terminated).toEqual(['10.42.0.10']);
    expect(t.pods.pods.size).toBe(0);
    expect(t.state()).toMatchObject({
      state: 'idle',
      podIp: null,
      podName: null,
    });
  });

  it('still deletes the pod when terminate fails', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    t.computeCtl.failTerminate = true;
    expect(await t.runtime.suspend(t.endpointId)).toBe('suspended');
    expect(t.pods.pods.size).toBe(0);
    expect(t.warnings.join('\n')).toContain('terminate');
  });

  it('is a no-op for an idle endpoint and clears a leaked pod', async () => {
    const t = await setup();
    t.pods.pods.set(t.podName, { metadata: { name: t.podName } });
    expect(await t.runtime.suspend(t.endpointId)).toBe('already-idle');
    expect(t.pods.pods.size).toBe(0);
    expect(t.computeCtl.terminated).toEqual([]);
  });

  it('refuses to suspend an endpoint that is starting', async () => {
    const t = await setup();
    await t.store.claimEndpointState(t.endpointId, ['idle'], 'starting');
    await expect(t.runtime.suspend(t.endpointId)).rejects.toBeInstanceOf(
      EndpointBusyError,
    );
  });

  it('suspends a deleted endpoint so its pod is cleaned up', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    const endpoint = t.state();
    if (endpoint) endpoint.deletedAt = new Date();
    expect(await t.runtime.suspend(t.endpointId)).toBe('suspended');
    expect(t.pods.pods.size).toBe(0);
  });

  it('removes the pod of an endpoint with no row at all', async () => {
    const t = await setup();
    const orphan = createMemoryNeonStore();
    const runtime = createComputeRuntime({
      store: orphan,
      pods: t.pods,
      computeCtl: t.computeCtl,
      specs: createSpecService({ store: orphan, storcon: t.storcon, signer }),
      signer,
      config: {
        computeImage: 'c',
        postgrestImage: 'p',
        controlPlaneUri: 'http://glue',
      },
      clock: t.clock,
    });
    t.pods.pods.set('compute-ep-lost-pod-00000000', {
      metadata: { name: 'compute-ep-lost-pod-00000000' },
    });
    expect(await runtime.suspend('ep-lost-pod-00000000')).toBe('already-idle');
    expect(t.pods.pods.size).toBe(0);
  });
});

describe('reconfigure', () => {
  it('pushes the current spec to a running compute, with delete_db operations', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    const applied = await t.runtime.reconfigure(t.endpointId, {
      deltaOperations: [{ action: 'delete_db', name: 'old', new_name: null }],
    });
    expect(applied).toBe(true);
    const push = t.computeCtl
      .configured[0] as FakeComputeCtl['configured'][number];
    expect(push.podIp).toBe('10.42.0.10');
    expect(push.computeId).toBe(t.endpointId);
    expect(push.config.spec.delta_operations).toEqual([
      { action: 'delete_db', name: 'old', new_name: null },
    ]);
  });

  it('does nothing for an idle endpoint', async () => {
    const t = await setup();
    expect(await t.runtime.reconfigure(t.endpointId)).toBe(false);
    expect(t.computeCtl.configured).toEqual([]);
  });

  it('lets a failed configure propagate so the operation retries', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    t.computeCtl.failConfigure = true;
    await expect(t.runtime.reconfigure(t.endpointId)).rejects.toThrowError(
      /configure failed/,
    );
  });
});
