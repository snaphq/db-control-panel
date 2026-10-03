import { describe, expect, it } from 'vitest';
import { createPlatformHarness } from './fakes.js';
import { reconcileSafekeepers } from './safekeeper-manager.js';

const options = { autoSpread: true, failureCooldownMs: 30 * 60_000 };

async function setup(
  overrides: Parameters<typeof createPlatformHarness>[0] = {},
) {
  const h = createPlatformHarness(overrides);
  const pass = (opts = options) => reconcileSafekeepers(h.deps, opts);
  const states = async () =>
    (await h.platform.listSafekeepers()).map((r) => [r.id, r.nodeId, r.state]);
  return { h, pass, states };
}

describe('a fresh cluster', () => {
  it('waits, without failing, until a node with the pageserver label exists', async () => {
    const { h, pass } = await setup();
    await h.addNode(1, { roles: ['compute'] });
    const result = await pass();
    expect(result.note).toMatch(/no eligible node/);
    expect(await h.platform.listSafekeepers()).toEqual([]);
  });

  it('starts all three safekeepers on the only node, registers them and makes them Active', async () => {
    const { h, pass, states } = await setup();
    await h.addNode(1);
    const result = await pass();
    expect(result.created).toEqual([1, 2, 3]);
    expect(result.registered).toEqual([1, 2, 3]);
    expect(await states()).toEqual([
      [1, 1, 'active'],
      [2, 1, 'active'],
      [3, 1, 'active'],
    ]);
    expect(
      [...h.kube.objects.values()].map((o) => o.workload.nodeName),
    ).toEqual(['host-1', 'host-1', 'host-1']);
    const registered = await h.storcon.listSafekeepers();
    expect(
      registered.map((s) => [
        s.id,
        s.scheduling_policy,
        s.availability_zone_id,
      ]),
    ).toEqual([
      [1, 'Active', 'az-1'],
      [2, 'Active', 'az-2'],
      [3, 'Active', 'az-3'],
    ]);
    expect(result.spreadOperation).toBeNull();
  });

  it('spreads the three over three nodes when they are there from the start', async () => {
    const { h, pass, states } = await setup();
    for (const id of [1, 2, 3]) await h.addNode(id);
    await pass();
    expect((await states()).map((s) => s[1]).sort()).toEqual([1, 2, 3]);
  });

  it('leaves safekeepers unregistered until their pod is Ready', async () => {
    const { h, pass, states } = await setup();
    h.kube.autoReady = false;
    await h.addNode(1);
    const first = await pass();
    expect(first.registered).toEqual([]);
    expect((await states()).every((s) => s[2] === 'creating')).toBe(true);
    expect(await h.storcon.listSafekeepers()).toEqual([]);

    for (const object of h.kube.objects.values()) object.ready = true;
    const second = await pass();
    expect(second.registered).toEqual([1, 2, 3]);
    expect(second.created).toEqual([]);
  });

  it('does nothing the second time', async () => {
    const { h, pass } = await setup();
    await h.addNode(1);
    await pass();
    const callsBefore = h.controller.calls.length;
    const result = await pass();
    expect(result).toMatchObject({
      created: [],
      registered: [],
      updated: null,
      spreadOperation: null,
    });
    expect(
      h.controller.calls
        .slice(callsBefore)
        .filter((c) => c.startsWith('upsert')),
    ).toEqual([]);
    expect((await h.platform.listSafekeepers()).length).toBe(3);
  });
});

describe('keeping the fleet healthy', () => {
  it('recreates a StatefulSet someone deleted, under the same id', async () => {
    const { h, pass } = await setup();
    await h.addNode(1);
    await pass();
    h.kube.objects.delete(2);
    await pass();
    expect(h.kube.objects.get(2)?.workload).toMatchObject({
      id: 2,
      nodeName: 'host-1',
    });
    expect((await h.platform.listSafekeepers()).length).toBe(3);
  });

  it('replaces a lost safekeeper on a node with room', async () => {
    const { h, pass, states } = await setup();
    for (const id of [1, 2, 3]) await h.addNode(id);
    await pass();
    await h.platform.setSafekeeperState(2, 'retired');
    h.kube.objects.delete(2);
    const result = await pass();
    expect(result.created).toEqual([4]);
    expect(await states()).toEqual([
      [1, 1, 'active'],
      [2, 2, 'retired'],
      [3, 3, 'active'],
      [4, 2, 'active'],
    ]);
  });

  it('skips its pass while a platform operation runs', async () => {
    const { h, pass } = await setup();
    await h.addNode(1);
    await h.platform.createOperation({
      action: 'pageservers.rebalance',
      params: {},
    });
    const result = await pass();
    expect(result.note).toMatch(/platform operation is running/);
    expect(await h.platform.listSafekeepers()).toEqual([]);
  });

  it('rolls a new image out one safekeeper per pass, and only while all are Ready', async () => {
    const { h, pass } = await setup();
    await h.addNode(1);
    await pass();
    h.deps.config.neonImage = 'ghcr.io/snaphq/neon:two';

    const first = await pass();
    expect(first.updated).toBe(1);
    expect(h.kube.objects.get(1)?.workload.image).toBe(
      'ghcr.io/snaphq/neon:two',
    );
    expect(h.kube.objects.get(2)?.workload.image).toBe(
      'ghcr.io/snaphq/neon:one',
    );

    // Safekeeper 1 is restarting: nothing else may be touched.
    const pod = h.kube.objects.get(1);
    if (pod) pod.ready = false;
    expect((await pass()).updated).toBeNull();
    if (pod) pod.ready = true;

    expect((await pass()).updated).toBe(2);
    expect((await pass()).updated).toBe(3);
    expect((await pass()).updated).toBeNull();
  });
});

describe('automatic spreading', () => {
  async function twoNodes() {
    const t = await setup();
    await t.h.addNode(1);
    await t.pass();
    await t.h.addNode(2);
    return t;
  }

  it('starts one spread operation when a second node makes the layout uneven', async () => {
    const { h, pass } = await twoNodes();
    const first = await pass();
    expect(first.spreadOperation).toMatch(/^op_/);
    expect(
      (await h.platform.findOperation(first.spreadOperation as string))?.params,
    ).toEqual({
      reason: 'layout',
    });
    // The operation is active, so the next pass leaves everything to it.
    expect((await pass()).spreadOperation).toBeNull();
  });

  it('does not start one when told not to', async () => {
    const { pass } = await twoNodes();
    expect(
      (await pass({ ...options, autoSpread: false })).spreadOperation,
    ).toBeNull();
  });

  it('waits out a cooldown after a failed spread, then tries again', async () => {
    const { h, pass } = await twoNodes();
    const started = await pass();
    const op = h.platform.operations.get(started.spreadOperation as string);
    if (!op) throw new Error('operation');
    op.status = 'failed';
    op.finishedAt = new Date(h.deps.now() - 5 * 60_000);
    expect((await pass()).spreadOperation).toBeNull();

    op.finishedAt = new Date(h.deps.now() - 31 * 60_000);
    expect((await pass()).spreadOperation).toMatch(/^op_/);
  });

  it('resumes a retirement an earlier operation left half done', async () => {
    const { h, pass } = await twoNodes();
    // An earlier spread brought up safekeeper 4 and was interrupted draining 3.
    const replacement = await h.platform.createSafekeeper({
      nodeId: 2,
      nodeName: 'host-2',
      operationId: 'op_old',
    });
    await h.platform.setSafekeeperState(replacement.id, 'active');
    await h.platform.setSafekeeperState(3, 'retiring');
    const result = await pass();
    expect(result.spreadOperation).toMatch(/^op_/);
    expect(
      (await h.platform.findOperation(result.spreadOperation as string))
        ?.params,
    ).toEqual({
      reason: 'resume',
    });
  });

  it('does not start one while a safekeeper is not Ready', async () => {
    const { h, pass } = await twoNodes();
    const pod = h.kube.objects.get(1);
    if (pod) pod.ready = false;
    expect((await pass()).spreadOperation).toBeNull();
  });

  it('starts none when the node count has not changed the layout', async () => {
    const { h, pass } = await setup();
    await h.addNode(1);
    await pass();
    expect((await pass()).spreadOperation).toBeNull();
  });
});
