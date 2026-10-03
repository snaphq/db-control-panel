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
  async function rebalance(final = false) {
    const id = `op_${++counter}`;
    operations.add(id, 'pageservers.rebalance');
    return { id, ...(await attempt(id, final)) };
  }
  const attached = () => {
    const counts: Record<number, number> = {};
    for (const shard of h.controller.shards) {
      if (shard.nodeAttached !== null) {
        counts[shard.nodeAttached] = (counts[shard.nodeAttached] ?? 0) + 1;
      }
    }
    return counts;
  };
  const migrations = () =>
    h.controller.calls.filter((c) => c.startsWith('migrateShard'));
  return { h, registry, operations, attempt, rebalance, attached, migrations };
}

describe('registry', () => {
  it('plans the rebalance in two steps', async () => {
    const t = await setup();
    expect(
      t.registry.planFor('pageservers.rebalance').map((s) => s.name),
    ).toEqual(['platform.rebalance.plan', 'platform.rebalance.execute']);
  });
});

describe('moving tenants onto a new pageserver', () => {
  async function newPageserver() {
    const t = await setup();
    await t.h.addPageserver(1);
    await t.h.addPageserver(2);
    t.h.addShards(1, 6);
    return t;
  }

  it('moves half of them, one at a time, and waits for each to settle', async () => {
    const t = await newPageserver();
    const run = await t.rebalance();
    expect(run.outcome).toBe('finished');
    expect(t.attached()).toEqual({ 1: 3, 2: 3 });
    const output = t.operations.get(run.id).progress.outputs[
      'platform.rebalance.execute'
    ] as {
      moved: number;
    };
    expect(output.moved).toBe(3);

    // Strictly sequential: a migrate call is never followed by another before the shard settles.
    const calls = t.h.controller.calls.filter(
      (c) => c.startsWith('migrateShard') || c.startsWith('describeTenant'),
    );
    const firstMigrate = calls.findIndex((c) => c.startsWith('migrateShard'));
    const secondMigrate = calls.findIndex(
      (c, i) => i > firstMigrate && c.startsWith('migrateShard'),
    );
    expect(
      calls
        .slice(firstMigrate, secondMigrate)
        .some((c) => c.startsWith('describeTenant')),
    ).toBe(true);
  });

  it('names the origin and asks for a graceful move by default', async () => {
    const t = await newPageserver();
    await t.rebalance();
    expect(t.migrations()).toHaveLength(3);
    for (const call of t.migrations()) {
      expect(call).toMatch(/ 1->2 prewarm=true$/);
    }
  });

  it('asks for an immediate move when prewarm is off', async () => {
    const t = await setup({ rebalancePrewarm: false });
    await t.h.addPageserver(1);
    await t.h.addPageserver(2);
    t.h.addShards(1, 2);
    await t.rebalance();
    expect(t.migrations()[0]).toMatch(/prewarm=false$/);
  });

  it('moves the preferred zone first, so the controller accepts the move and keeps it', async () => {
    const t = await newPageserver();
    await t.rebalance();
    const calls = t.h.controller.calls;
    const firstAz = calls.findIndex((c) => c.startsWith('setPreferredAzs'));
    const firstMigrate = calls.findIndex((c) => c.startsWith('migrateShard'));
    expect(firstAz).toBeGreaterThan(-1);
    expect(firstAz).toBeLessThan(firstMigrate);
    expect(calls[firstAz]).toContain('"az-2"');
    for (const shard of t.h.controller.shards.filter(
      (s) => s.nodeAttached === 2,
    )) {
      expect(shard.preferredAz).toBe('az-2');
    }
  });

  it('leaves the preferred zone alone when both pageservers share a zone', async () => {
    const t = await setup();
    await t.h.addPageserver(1);
    await t.h.addPageserver(2);
    for (const ps of t.h.controller.pageservers) ps.az = 'az-1';
    t.h.addShards(1, 4, { preferredAz: 'az-1' });
    await t.rebalance();
    expect(
      t.h.controller.calls.some((c) => c.startsWith('setPreferredAzs')),
    ).toBe(false);
    expect(t.attached()).toEqual({ 1: 2, 2: 2 });
  });

  it('respects the cap on moves per run', async () => {
    const t = await setup({ rebalanceMaxMoves: 2 });
    await t.h.addPageserver(1);
    await t.h.addPageserver(2);
    t.h.addShards(1, 10);
    await t.rebalance();
    expect(t.attached()).toEqual({ 1: 8, 2: 2 });
  });

  it('plans nothing for a balanced cluster', async () => {
    const t = await setup();
    await t.h.addPageserver(1);
    await t.h.addPageserver(2);
    t.h.addShards(1, 3);
    t.h.addShards(2, 3);
    const run = await t.rebalance();
    expect(run.outcome).toBe('finished');
    expect(t.migrations()).toEqual([]);
  });

  it('leaves pageservers that are not Active alone', async () => {
    const t = await setup();
    await t.h.addPageserver(1);
    await t.h.addPageserver(2);
    await t.h.addPageserver(3, { availability: 'Offline' });
    t.h.addShards(1, 4);
    t.h.addShards(3, 8);
    await t.rebalance();
    expect(t.attached()).toEqual({ 1: 2, 2: 2, 3: 8 });
  });
});

describe('tenants that must not move', () => {
  it('skips a tenant the controller is reconciling and one with a control-plane operation', async () => {
    const t = await setup();
    await t.h.addPageserver(1);
    await t.h.addPageserver(2);
    const shards = t.h.addShards(1, 4);
    if (shards[0]) shards[0].reconciling = true;
    const busy = shards[1];
    if (!busy) throw new Error('seed');
    // A project with an operation in flight owns this tenant.
    t.h.neon.projects.set('proj_1', {
      id: 'proj_1',
      consoleProjectId: 'cp_busy',
      consoleOrgId: 'org',
      name: 'busy',
      tenantId: busy.tenantId,
      pgVersion: 17,
      historyRetentionSeconds: 86_400,
      allowedIps: null,
      dataApiJwks: null,
      dataApiSigningKeyEnc: null,
      dataApiCustomJwks: null,
      createdAt: new Date(),
      deletedAt: null,
    });
    t.h.neon.operations.set('op_busy', {
      id: 'op_busy',
      consoleProjectId: 'cp_busy',
      consoleOrgId: 'org',
      targetType: 'project',
      targetId: 'proj_1',
      action: 'endpoint.update',
      status: 'running',
      failuresCount: 0,
      error: null,
      params: {},
      progress: { completedSteps: [], outputs: {} },
      createdAt: new Date(),
      updatedAt: new Date(),
      finishedAt: null,
    });
    await t.rebalance();
    const moved = t.migrations().join('\n');
    expect(moved).not.toContain(shards[0]?.shardId);
    expect(moved).not.toContain(busy.shardId);
    expect(t.migrations()).toHaveLength(2);
  });

  it('skips a shard whose scheduling policy pins it', async () => {
    const t = await setup();
    await t.h.addPageserver(1);
    await t.h.addPageserver(2);
    t.h.addShards(1, 4, { schedulingPolicy: 'Pause' });
    await t.rebalance();
    expect(t.migrations()).toEqual([]);
  });

  it('skips a move the controller refuses, and puts the preferred zone back', async () => {
    const t = await setup();
    await t.h.addPageserver(1);
    await t.h.addPageserver(2);
    const shards = t.h.addShards(1, 2);
    const first = shards[0];
    if (!first) throw new Error('seed');
    t.h.controller.failures.set(`migrateShard:${first.shardId}`, [
      new StorconError('Migration to a worse-scoring node', 'PUT', '/', 412),
    ]);
    const run = await t.rebalance();
    expect(run.outcome).toBe('finished');
    expect(first.nodeAttached).toBe(1);
    expect(first.preferredAz).toBe('az-1');
    const output = t.operations.get(run.id).progress.outputs[
      'platform.rebalance.execute'
    ] as {
      skipped: number;
      results: { reason?: string }[];
    };
    expect(output.skipped).toBe(1);
    expect(output.results[0]?.reason).toMatch(/worse-scoring/);
  });

  it('notices a shard that someone else moved in the meantime', async () => {
    const t = await setup();
    await t.h.addPageserver(1);
    await t.h.addPageserver(2);
    const [shard] = t.h.addShards(1, 2);
    if (!shard) throw new Error('seed');
    // The plan is made, then another actor moves the shard before the executor gets to it.
    const run = { id: 'op_x' };
    t.operations.add(run.id, 'pageservers.rebalance');
    const original = t.h.admin.describeTenant;
    let first = true;
    t.h.admin.describeTenant = async (tenantId) => {
      if (first && tenantId === shard.tenantId) {
        shard.nodeAttached = 2;
      }
      first = false;
      return original(tenantId);
    };
    expect((await t.attempt(run.id)).outcome).toBe('finished');
  });
});

describe('a move that does not settle', () => {
  it('cancels it, restores the zone and fails the operation without retrying', async () => {
    const t = await setup({ settleTimeoutMs: 30_000 });
    await t.h.addPageserver(1);
    await t.h.addPageserver(2);
    const [shard] = t.h.addShards(1, 2);
    if (!shard) throw new Error('seed');
    t.h.controller.settlePolls = 10_000;
    const run = await t.rebalance();
    expect(run.outcome).toBe('failed');
    expect(t.operations.get(run.id).error).toMatch(
      /did not settle on node 2 within 30s/,
    );
    expect(t.h.controller.calls).toContain(
      `migrateShard ${shard.shardId} 1->1 prewarm=false`,
    );
    expect(shard.nodeAttached).toBe(1);
    expect(shard.preferredAz).toBe('az-1');
  });
});

describe('resuming', () => {
  it('does not repeat the moves an earlier attempt finished', async () => {
    const t = await setup();
    await t.h.addPageserver(1);
    await t.h.addPageserver(2);
    const shards = t.h.addShards(1, 4);
    // The controller hiccups on the second tenant of the plan (a 500 is retried, not skipped).
    const second = shards[1];
    if (!second) throw new Error('seed');
    t.h.controller.failures.set(`migrateShard:${second.shardId}`, [
      new StorconError('internal error', 'PUT', '/', 500),
    ]);
    const first = await t.rebalance();
    expect(first.outcome).toBe('retry');
    expect(t.attached()).toEqual({ 1: 3, 2: 1 });
    const before = t.migrations().length;

    const again = await t.attempt(first.id);
    expect(again.outcome).toBe('finished');
    expect(t.attached()).toEqual({ 1: 2, 2: 2 });
    // The first tenant was not asked to move again.
    expect(
      t
        .migrations()
        .slice(before)
        .filter((c) => c.includes(shards[0]?.shardId ?? '')).length,
    ).toBe(0);
    expect(t.operations.get(first.id).progress.completedSteps).toEqual([
      'platform.rebalance.plan',
      'platform.rebalance.execute',
    ]);
  });
});
