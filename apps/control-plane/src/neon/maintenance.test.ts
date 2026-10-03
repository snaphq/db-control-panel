import { afterEach, describe, expect, it, vi } from 'vitest';
import { createComputeRuntime } from './compute-runtime.js';
import {
  createFakeClock,
  createFakeComputeCtl,
  createFakePods,
  createFakeStorcon,
  newTestSigner,
  seedProject,
} from './fakes.js';
import { createIdleSweeper } from './idle-suspend.js';
import { startLoop } from './loops.js';
import { discoverPageservers, registerSafekeepers } from './registration.js';
import { createSpecService } from './spec-service.js';
import type { StorconSafekeeper } from './storcon-client.js';

const signer = newTestSigner();

async function sweeperSetup() {
  const seeded = await seedProject();
  const pods = createFakePods();
  const computeCtl = createFakeComputeCtl();
  const storcon = createFakeStorcon();
  const clock = createFakeClock();
  const runtime = createComputeRuntime({
    store: seeded.store,
    pods,
    computeCtl,
    specs: createSpecService({ store: seeded.store, storcon, signer }),
    signer,
    config: {
      computeImage: 'c',
      postgrestImage: 'p',
      controlPlaneUri: 'http://glue',
    },
    clock,
    logger: { warn: () => {} },
  });
  const warnings: string[] = [];
  const sweeper = createIdleSweeper({
    store: seeded.store,
    computeCtl,
    runtime,
    now: clock.now,
    logger: { warn: (m) => warnings.push(m) },
  });
  await runtime.wake(seeded.endpointId);
  const endpoint = () => seeded.store.endpoints.get(seeded.endpointId);
  const minutesAgo = (m: number) =>
    new Date(clock.now().getTime() - m * 60_000);
  return {
    ...seeded,
    pods,
    computeCtl,
    clock,
    runtime,
    sweeper,
    endpoint,
    minutesAgo,
    warnings,
  };
}

describe('idle suspend', () => {
  it('suspends a compute idle for longer than its timeout (default 300s)', async () => {
    const t = await sweeperSetup();
    t.computeCtl.statuses.set('10.42.0.10', {
      status: 'running',
      lastActive: t.minutesAgo(10),
      error: null,
    });
    const endpoint = t.endpoint();
    if (endpoint) endpoint.lastActiveAt = t.minutesAgo(10);
    const result = await t.sweeper.sweep();
    expect(result.suspended).toEqual([t.endpointId]);
    expect(t.endpoint()?.state).toBe('idle');
    expect(t.pods.pods.size).toBe(0);
    expect(t.computeCtl.terminated).toEqual(['10.42.0.10']);
  });

  it('leaves a recently active compute alone', async () => {
    const t = await sweeperSetup();
    t.computeCtl.statuses.set('10.42.0.10', {
      status: 'running',
      lastActive: t.minutesAgo(1),
      error: null,
    });
    expect((await t.sweeper.sweep()).suspended).toEqual([]);
    expect(t.endpoint()?.state).toBe('running');
  });

  it('counts a recent wake as activity even when compute_ctl reports none', async () => {
    const t = await sweeperSetup();
    // wake stamped lastActiveAt just now; compute_ctl has seen no query yet.
    expect((await t.sweeper.sweep()).suspended).toEqual([]);
  });

  it('records the newer activity time from compute_ctl', async () => {
    const t = await sweeperSetup();
    const lastActive = t.minutesAgo(0);
    t.computeCtl.statuses.set('10.42.0.10', {
      status: 'running',
      lastActive,
      error: null,
    });
    const endpoint = t.endpoint();
    if (endpoint) endpoint.lastActiveAt = t.minutesAgo(3);
    await t.sweeper.sweep();
    expect(t.endpoint()?.lastActiveAt?.getTime()).toBe(lastActive.getTime());
  });

  it('never suspends an endpoint with timeout 0', async () => {
    const t = await sweeperSetup();
    const endpoint = t.endpoint();
    if (endpoint) {
      endpoint.suspendTimeoutSeconds = 0;
      endpoint.lastActiveAt = t.minutesAgo(600);
    }
    t.computeCtl.statuses.set('10.42.0.10', {
      status: 'running',
      lastActive: t.minutesAgo(600),
      error: null,
    });
    expect((await t.sweeper.sweep()).suspended).toEqual([]);
  });

  it('does not touch a compute that is being reconfigured', async () => {
    const t = await sweeperSetup();
    const endpoint = t.endpoint();
    if (endpoint) endpoint.lastActiveAt = t.minutesAgo(600);
    t.computeCtl.statuses.set('10.42.0.10', {
      status: 'configuration',
      lastActive: t.minutesAgo(600),
      error: null,
    });
    expect((await t.sweeper.sweep()).suspended).toEqual([]);
  });

  it('cleans up a failed compute immediately', async () => {
    const t = await sweeperSetup();
    t.computeCtl.statuses.set('10.42.0.10', {
      status: 'failed',
      lastActive: null,
      error: 'x',
    });
    expect((await t.sweeper.sweep()).suspended).toEqual([t.endpointId]);
  });

  it('cleans up a compute that stays unreachable for three sweeps', async () => {
    const t = await sweeperSetup();
    t.computeCtl.unreachablePolls = 1000;
    expect((await t.sweeper.sweep()).suspended).toEqual([]);
    expect((await t.sweeper.sweep()).suspended).toEqual([]);
    expect((await t.sweeper.sweep()).suspended).toEqual([t.endpointId]);
    expect(t.endpoint()?.state).toBe('idle');
    expect(t.warnings).toHaveLength(3);
  });

  it('forgets earlier misses once the compute answers again', async () => {
    const t = await sweeperSetup();
    t.computeCtl.unreachablePolls = 2;
    await t.sweeper.sweep();
    await t.sweeper.sweep();
    t.computeCtl.unreachablePolls = 0;
    await t.sweeper.sweep();
    t.computeCtl.unreachablePolls = 1000;
    expect((await t.sweeper.sweep()).suspended).toEqual([]);
  });

  it('keeps sweeping the others when one suspend fails', async () => {
    const t = await sweeperSetup();
    const endpoint = t.endpoint();
    if (endpoint) endpoint.lastActiveAt = t.minutesAgo(600);
    t.computeCtl.statuses.set('10.42.0.10', {
      status: 'running',
      lastActive: t.minutesAgo(600),
      error: null,
    });
    vi.spyOn(t.runtime, 'suspend').mockRejectedValueOnce(new Error('k8s down'));
    const result = await t.sweeper.sweep();
    expect(result.failed).toEqual([t.endpointId]);
    expect(t.endpoint()?.state).toBe('running');
  });
});

const safekeeper = (
  id: number,
  overrides: Partial<StorconSafekeeper> = {},
): StorconSafekeeper => ({
  id,
  host: `safekeeper-${id}.neon.svc.cluster.local`,
  port: 5454,
  http_port: 7676,
  availability_zone_id: `az-${id}`,
  scheduling_policy: 'Active',
  ...overrides,
});

describe('registerSafekeepers', () => {
  it('registers and activates the given safekeepers on an empty controller', async () => {
    const storcon = createFakeStorcon();
    storcon.safekeepers = [];
    const result = await registerSafekeepers(storcon, [1, 2, 3]);
    expect(result).toEqual({ upserted: [1, 2, 3], activated: [1, 2, 3] });
    expect(storcon.calls).toEqual([
      'listSafekeepers',
      'upsertSafekeeper 1 safekeeper-1.neon.svc.cluster.local',
      'setPolicy 1 Active',
      'upsertSafekeeper 2 safekeeper-2.neon.svc.cluster.local',
      'setPolicy 2 Active',
      'upsertSafekeeper 3 safekeeper-3.neon.svc.cluster.local',
      'setPolicy 3 Active',
    ]);
  });

  it('does nothing when everything is registered and active', async () => {
    const storcon = createFakeStorcon();
    storcon.listSafekeepers = async () => [
      safekeeper(1),
      safekeeper(2),
      safekeeper(3),
    ];
    expect(await registerSafekeepers(storcon, [1, 2, 3])).toEqual({
      upserted: [],
      activated: [],
    });
  });

  it('re-registers a changed address and activates one that is still Activating', async () => {
    const storcon = createFakeStorcon();
    storcon.listSafekeepers = async () => [
      safekeeper(1, { host: 'old-host' }),
      safekeeper(2, { scheduling_policy: 'Activating' }),
      safekeeper(3),
    ];
    expect(await registerSafekeepers(storcon, [1, 2, 3])).toEqual({
      upserted: [1],
      activated: [2],
    });
  });

  it('leaves paused and decommissioned safekeepers as the operator set them', async () => {
    const storcon = createFakeStorcon();
    storcon.listSafekeepers = async () => [
      safekeeper(1, { scheduling_policy: 'Pause' }),
      safekeeper(2, { scheduling_policy: 'Decomissioned' }),
      safekeeper(3),
    ];
    expect(await registerSafekeepers(storcon, [1, 2, 3])).toEqual({
      upserted: [],
      activated: [],
    });
  });
});

describe('discoverPageservers', () => {
  it('records each controller node as a pageserver node', async () => {
    const storcon = createFakeStorcon();
    const { createMemoryNeonStore } = await import('./store-memory.js');
    const store = createMemoryNeonStore();
    expect(await discoverPageservers(storcon, store)).toEqual([1, 2]);
    expect(await store.listNodes()).toMatchObject([
      {
        id: 1,
        name: 'pageserver-1',
        tailscaleIp: '100.64.0.1',
        zone: 'az-1',
        roles: ['pageserver'],
        registeredPageserver: true,
      },
      {
        id: 2,
        name: 'pageserver-2',
        tailscaleIp: '100.64.0.2',
        zone: 'az-2',
        roles: ['pageserver'],
        registeredPageserver: true,
      },
    ]);
  });

  it('keeps the other roles a node already has', async () => {
    const storcon = createFakeStorcon();
    const { createMemoryNeonStore } = await import('./store-memory.js');
    const store = createMemoryNeonStore();
    await store.upsertNode({
      id: 1,
      name: 'n1',
      tailscaleIp: '100.64.0.1',
      zone: 'az-1',
      addRoles: ['compute', 'libsql'],
    });
    await discoverPageservers(storcon, store);
    expect([...((await store.listNodes())[0]?.roles ?? [])].sort()).toEqual([
      'compute',
      'libsql',
      'pageserver',
    ]);
  });
});

describe('startLoop', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs at once and then on the interval, surviving failures', async () => {
    vi.useFakeTimers();
    const errors: string[] = [];
    let calls = 0;
    const loop = startLoop(
      'demo',
      1000,
      async () => {
        calls += 1;
        if (calls === 2) throw new Error('boom');
      },
      { info: () => {}, error: (m) => errors.push(m) },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(3);
    expect(errors).toEqual(['demo failed: boom']);
    await loop.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toBe(3);
  });

  it('waits for a run in progress when stopping', async () => {
    vi.useFakeTimers();
    let finished = false;
    const loop = startLoop(
      'slow',
      1000,
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            finished = true;
            resolve();
          }, 500),
        ),
      { info: () => {}, error: () => {} },
    );
    const stopping = loop.stop();
    await vi.advanceTimersByTimeAsync(500);
    await stopping;
    expect(finished).toBe(true);
  });
});
