import { describe, expect, it } from 'vitest';
import { StorconError } from '../neon/storcon-http.js';
import { createMemoryOperationStore } from '../operations/memory-store.js';
import { runOperation } from '../operations/runner.js';
import { StepRegistry } from '../operations/steps.js';
import { createPlatformHarness } from './fakes.js';
import { registerPlatformSteps } from './steps.js';

const quiet = { info: () => {}, error: () => {} };

async function setup(
  overrides: Parameters<typeof createPlatformHarness>[0] = {},
) {
  const h = createPlatformHarness(overrides);
  const registry = registerPlatformSteps(new StepRegistry(), h.deps);
  const operations = createMemoryOperationStore();
  let counter = 0;
  /** Seeds the three bootstrap safekeepers on `nodes` (cycled), all active and registered. */
  async function seedFleet(nodeIds: number[]) {
    for (const nodeId of nodeIds) {
      await h.addNode(nodeId).catch(() => {});
      const row = await h.platform.createSafekeeper({
        nodeId,
        nodeName: `host-${nodeId}`,
        operationId: null,
      });
      await h.platform.setSafekeeperState(row.id, 'active');
      await h.kube.ensure({
        id: row.id,
        nodeName: `host-${nodeId}`,
        image: h.deps.config.neonImage,
        pullSecret: h.deps.config.pullSecret,
        entrypointConfigMap: h.deps.config.entrypointConfigMap,
        storage: h.deps.config.safekeeperStorage,
      });
      h.controller.safekeepers.set(row.id, {
        id: row.id,
        host: `safekeeper-${row.id}.neon.svc.cluster.local`,
        port: 5454,
        http_port: 7676,
        availability_zone_id: `az-${row.id}`,
        scheduling_policy: 'Active',
      });
    }
  }
  async function spread(final = false) {
    const id = `op_${++counter}`;
    operations.add(id, 'safekeepers.spread');
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
  const states = async () =>
    Object.fromEntries(
      (await h.platform.listSafekeepers()).map((r) => [r.id, r.state]),
    );
  return { h, registry, operations, seedFleet, spread, attempt, states };
}

describe('registry', () => {
  it('plans the spread in six steps', async () => {
    const t = await setup();
    expect(t.registry.planFor('safekeepers.spread').map((s) => s.name)).toEqual(
      [
        'platform.spread.plan',
        'platform.spread.create',
        'platform.spread.ready',
        'platform.spread.register',
        'platform.spread.migrate',
        'platform.spread.retire',
      ],
    );
  });
});

describe('a single node', () => {
  it('has nothing to spread, and says why', async () => {
    const t = await setup();
    await t.seedFleet([1, 1, 1]);
    const run = await t.spread();
    expect(run.outcome).toBe('finished');
    expect(
      t.operations.get(run.id).progress.outputs['platform.spread.plan'],
    ).toMatchObject({
      move: null,
      note: expect.stringMatching(/already spread/),
    });
    expect(t.h.kube.calls.filter((c) => c.startsWith('ensure'))).toHaveLength(
      3,
    );
    expect(await t.states()).toEqual({ 1: 'active', 2: 'active', 3: 'active' });
  });
});

describe('a second node joins', () => {
  async function twoNodes() {
    const t = await setup();
    await t.seedFleet([1, 1, 1]);
    await t.h.addNode(2);
    const timelines = Array.from({ length: 5 }, () =>
      t.h.addTimeline([1, 2, 3]),
    );
    return { t, timelines };
  }

  it('moves one safekeeper: create, register, migrate every timeline, then decommission', async () => {
    const { t, timelines } = await twoNodes();
    const run = await t.spread();
    expect(run.outcome).toBe('finished');

    // The new safekeeper 4 sits on node 2; safekeeper 3 (highest id on the busy node) left.
    const rows = await t.h.platform.listSafekeepers();
    expect(rows.map((r) => [r.id, r.nodeId, r.state])).toEqual([
      [1, 1, 'active'],
      [2, 1, 'active'],
      [3, 1, 'retired'],
      [4, 2, 'active'],
    ]);
    expect(rows[3]?.operationId).toBe(run.id);
    for (const { tenantId, timelineId } of timelines) {
      expect(
        t.h.controller.timelines.get(`${tenantId}/${timelineId}`)?.skSet,
      ).toEqual([1, 2, 4]);
    }
    expect(t.h.controller.safekeepers.get(4)).toMatchObject({
      host: 'safekeeper-4.neon.svc.cluster.local',
      availability_zone_id: 'az-4',
      scheduling_policy: 'Active',
    });
    expect(t.h.controller.safekeepers.get(3)?.scheduling_policy).toBe(
      'Decomissioned',
    );
    expect([...t.h.kube.objects.keys()]).toEqual([1, 2, 4]);
    expect(t.h.kube.objects.get(4)?.workload.nodeName).toBe('host-2');
    expect(rows[2]?.drain).toMatchObject({ total: 5, migrated: 5, failed: [] });
  });

  it('registers the new safekeeper before moving anything and decommissions last', async () => {
    const { t } = await twoNodes();
    await t.spread();
    const calls = t.h.controller.calls;
    const at = (prefix: string) => calls.findIndex((c) => c.startsWith(prefix));
    expect(at('upsertSafekeeper 4')).toBeGreaterThanOrEqual(0);
    expect(at('upsertSafekeeper 4')).toBeLessThan(at('migrateTimeline'));
    expect(at('setPolicy 4 Active')).toBeLessThan(at('migrateTimeline'));
    expect(
      calls.lastIndexOf(
        calls.filter((c) => c.startsWith('migrateTimeline')).at(-1) as string,
      ),
    ).toBeLessThan(at('setPolicy 3 Decomissioned'));
    expect(at('setPolicy 3 Decomissioned')).toBeGreaterThan(-1);
  });

  it('is a no-op the second time: the layout is 2 + 1 now', async () => {
    const { t } = await twoNodes();
    await t.spread();
    const again = await t.spread();
    expect(again.outcome).toBe('finished');
    expect((await t.h.platform.listSafekeepers()).length).toBe(4);
    expect(
      t.operations.get(again.id).progress.outputs['platform.spread.plan'],
    ).toMatchObject({
      move: null,
    });
  });

  it('waits for the old safekeeper to be excluded before decommissioning it', async () => {
    const { t } = await twoNodes();
    t.h.controller.lingerPolls = 3;
    const run = await t.spread();
    expect(run.outcome).toBe('finished');
    expect(t.h.controller.safekeepers.get(3)?.scheduling_policy).toBe(
      'Decomissioned',
    );
    const lists = t.h.controller.calls.filter((c) => c === 'listTimelines 3');
    expect(lists.length).toBeGreaterThan(2);
  });

  it('does not decommission a safekeeper that still holds a timeline the controller does not manage', async () => {
    const { t } = await twoNodes();
    t.h.controller.orphans.set(3, [`${'f'.repeat(32)}/${'e'.repeat(32)}`]);
    const run = await t.spread();
    expect(run.outcome).toBe('retry');
    expect(String(run.thrown)).toMatch(/still holds 1 timeline/);
    expect(t.h.controller.safekeepers.get(3)?.scheduling_policy).toBe('Active');
    expect(t.h.kube.objects.has(3)).toBe(true);
    expect(await t.states()).toMatchObject({ 3: 'retiring', 4: 'active' });
  });
});

describe('failures and resuming', () => {
  async function twoNodes(timelineCount = 4) {
    const t = await setup();
    await t.seedFleet([1, 1, 1]);
    await t.h.addNode(2);
    const timelines = Array.from({ length: timelineCount }, () =>
      t.h.addTimeline([1, 2, 3]),
    );
    return { t, timelines };
  }
  const k = (tl: { tenantId: string; timelineId: string }) =>
    `${tl.tenantId}/${tl.timelineId}`;
  const boom = () =>
    new StorconError('pull_timeline to 4 failed', 'POST', '/', 500);

  it('aborts the timeline that cannot move, keeps the rest, and finishes on retry', async () => {
    const { t, timelines } = await twoNodes();
    const bad = timelines[1];
    if (!bad) throw new Error('seed');
    t.h.controller.failures.set(`migrateTimeline:${k(bad)}`, [
      boom(),
      boom(),
      boom(),
    ]);

    const first = await t.spread();
    expect(first.outcome).toBe('retry');
    expect(String(first.thrown)).toMatch(
      /1 timeline\(s\) could not be moved off safekeeper 3/,
    );
    expect(t.h.controller.calls).toContain(`abortMigration ${k(bad)}`);
    // The others moved; the failing one stayed on its committed set.
    expect(t.h.controller.timelines.get(k(bad))?.skSet).toEqual([1, 2, 3]);
    expect(
      t.h.controller.timelines.get(k(timelines[0] as never))?.skSet,
    ).toEqual([1, 2, 4]);
    const stuck = await t.h.platform.getSafekeeper(3);
    expect(stuck?.state).toBe('retiring');
    expect(stuck?.drain?.failed).toHaveLength(1);

    const second = await t.attempt(first.id);
    expect(second.outcome).toBe('finished');
    expect(t.h.controller.timelines.get(k(bad))?.skSet).toEqual([1, 2, 4]);
    // Resuming did not create a second replacement or repeat the earlier steps.
    expect((await t.h.platform.listSafekeepers()).map((r) => r.id)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(
      t.h.kube.calls.filter((c) => c === 'ensure 4@host-2').length,
    ).toBeGreaterThan(0);
    expect(await t.states()).toEqual({
      1: 'active',
      2: 'active',
      3: 'retired',
      4: 'active',
    });
  });

  it('retries a timeline step before giving up on it', async () => {
    const { t, timelines } = await twoNodes(1);
    const only = timelines[0];
    if (!only) throw new Error('seed');
    t.h.controller.failures.set(`migrateTimeline:${k(only)}`, [boom(), boom()]);
    const run = await t.spread();
    expect(run.outcome).toBe('finished');
    expect(
      t.h.controller.calls.filter((c) => c.startsWith('migrateTimeline'))
        .length,
    ).toBe(3);
  });

  it('cancels a conflicting pending migration before asking for its own set', async () => {
    const { t, timelines } = await twoNodes(1);
    const only = timelines[0];
    if (!only) throw new Error('seed');
    const timeline = t.h.controller.timelines.get(k(only));
    if (timeline) timeline.newSkSet = [1, 2, 5];
    const run = await t.spread();
    expect(run.outcome).toBe('finished');
    expect(t.h.controller.calls).toContain(`abortMigration ${k(only)}`);
    expect(t.h.controller.timelines.get(k(only))?.skSet).toEqual([1, 2, 4]);
  });

  it('treats a timeline that disappeared mid-move as done', async () => {
    const { t, timelines } = await twoNodes(2);
    const gone = timelines[0];
    if (!gone) throw new Error('seed');
    t.h.controller.failures.set(`migrateTimeline:${k(gone)}`, [
      new StorconError('timeline not found', 'POST', '/', 404),
    ]);
    const run = await t.spread();
    expect(run.outcome).toBe('finished');
  });

  it('waits for the new pod, fails the step when it never gets Ready, and goes on once it does', async () => {
    const { t } = await twoNodes();
    t.h.kube.autoReady = false;
    const first = await t.spread();
    expect(first.outcome).toBe('retry');
    expect(String(first.thrown)).toMatch(
      /Safekeeper 4 on host-2 is not Ready after 60s/,
    );
    // Only the steps up to `ready` ran; nothing was registered or moved.
    expect(t.h.controller.safekeepers.has(4)).toBe(false);
    expect(await t.states()).toMatchObject({ 3: 'active', 4: 'creating' });

    const pod = t.h.kube.objects.get(4);
    if (pod) pod.ready = true;
    const second = await t.attempt(first.id);
    expect(second.outcome).toBe('finished');
    expect(
      t.h.kube.calls.filter((c) => c === 'ensure 4@host-2').length,
    ).toBeGreaterThanOrEqual(1);
    expect((await t.h.platform.listSafekeepers()).length).toBe(4);
  });

  it('does not reuse the row when the create step is repeated', async () => {
    const { t } = await twoNodes(1);
    // A crash after the row was inserted but before the step's output was saved.
    const id = 'op_crash';
    t.operations.add(id, 'safekeepers.spread');
    await t.h.platform.createSafekeeper({
      nodeId: 2,
      nodeName: 'host-2',
      operationId: id,
    });
    const run = await t.attempt(id);
    expect(run.outcome).toBe('finished');
    expect(
      (await t.h.platform.listSafekeepers()).filter(
        (r) => r.operationId === id,
      ),
    ).toHaveLength(1);
  });

  it('stops without moving anything while another safekeeper is not Ready', async () => {
    const { t } = await twoNodes();
    const pod = t.h.kube.objects.get(2);
    if (pod) pod.ready = false;
    const run = await t.spread();
    expect(run.outcome).toBe('finished');
    expect(
      t.operations.get(run.id).progress.outputs['platform.spread.plan'],
    ).toMatchObject({
      move: null,
      note: expect.stringMatching(/safekeeper 2 is not Ready/),
    });
    expect((await t.h.platform.listSafekeepers()).length).toBe(3);
  });

  it('resumes an interrupted retirement in a later operation', async () => {
    const { t } = await twoNodes(2);
    // An earlier operation created safekeeper 4 and left 3 retiring.
    await t.seedFleet([2]);
    await t.h.platform.setSafekeeperState(3, 'retiring');
    const run = await t.spread();
    expect(run.outcome).toBe('finished');
    expect(await t.states()).toEqual({
      1: 'active',
      2: 'active',
      3: 'retired',
      4: 'active',
    });
    expect((await t.h.platform.listSafekeepers()).length).toBe(4);
  });

  it('retires the surplus one when an interrupted move left four active safekeepers', async () => {
    const { t, timelines } = await twoNodes(2);
    await t.seedFleet([2]);
    const run = await t.spread();
    expect(run.outcome).toBe('finished');
    expect(await t.states()).toEqual({
      1: 'active',
      2: 'active',
      3: 'retired',
      4: 'active',
    });
    for (const tl of timelines) {
      expect(t.h.controller.timelines.get(k(tl))?.skSet).toEqual([1, 2, 4]);
    }
  });

  it('removes a safekeeper an earlier operation never finished creating', async () => {
    const { t } = await twoNodes(1);
    const abandoned = await t.h.platform.createSafekeeper({
      nodeId: 2,
      nodeName: 'host-2',
      operationId: 'op_dead',
    });
    t.h.kube.autoReady = false;
    await t.h.kube.ensure({
      id: abandoned.id,
      nodeName: 'host-2',
      image: 'x',
      pullSecret: null,
      entrypointConfigMap: 'c',
      storage: '50Gi',
    });
    t.h.kube.autoReady = true;
    const run = await t.spread();
    expect(run.outcome).toBe('finished');
    expect((await t.h.platform.getSafekeeper(abandoned.id))?.state).toBe(
      'retired',
    );
    expect(t.h.kube.calls).toContain(`remove ${abandoned.id}`);
    // The real move used a fresh id.
    expect((await t.states())[5]).toBe('active');
  });

  it('refuses to retire when fewer than the wanted number would remain', async () => {
    const { t } = await twoNodes(0);
    await t.seedFleet([2]);
    await t.h.platform.setSafekeeperState(2, 'retired');
    await t.h.platform.setSafekeeperState(1, 'retired');
    // Safekeeper 3 retiring with only safekeeper 4 active: nothing may replace it.
    await t.h.platform.setSafekeeperState(3, 'retiring');
    const run = await t.spread();
    expect(run.outcome).toBe('failed');
    expect(run.thrown).toBeNull();
    expect(t.operations.get(run.id).error).toMatch(
      /Refusing to retire safekeeper 3/,
    );
  });
});
