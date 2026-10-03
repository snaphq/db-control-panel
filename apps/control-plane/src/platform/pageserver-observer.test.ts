import { describe, expect, it } from 'vitest';
import { StorconError } from '../neon/storcon-http.js';
import { createPlatformHarness } from './fakes.js';
import { observePageservers } from './pageserver-observer.js';

const on = { autoRebalance: true };

async function setup() {
  const h = createPlatformHarness();
  const stats = async (id: number) =>
    (await h.neon.listNodes()).find((n) => n.id === id)?.capacity.pageserver as
      | {
          attachedShards: number | null;
          activeSeen: boolean;
          availability: string;
        }
      | undefined;
  return { h, stats };
}

describe('observePageservers', () => {
  it("records each pageserver's state and attached shard count", async () => {
    const { h, stats } = await setup();
    await h.addPageserver(1);
    await h.addPageserver(2);
    h.addShards(1, 5);
    h.addShards(2, 2);
    await observePageservers(h.deps, on);
    expect(await stats(1)).toMatchObject({
      attachedShards: 5,
      availability: 'Active',
    });
    expect(await stats(2)).toMatchObject({ attachedShards: 2 });
  });

  it('does not start a rebalance for the first pageserver, and remembers it was seen', async () => {
    const { h, stats } = await setup();
    await h.addPageserver(1);
    h.addShards(1, 3);
    expect(
      (await observePageservers(h.deps, on)).rebalanceOperation,
    ).toBeNull();
    expect((await stats(1))?.activeSeen).toBe(true);
  });

  it('starts one rebalance when a pageserver joins an unbalanced cluster, and only one', async () => {
    const { h, stats } = await setup();
    await h.addPageserver(1);
    h.addShards(1, 8);
    await observePageservers(h.deps, on);

    await h.addPageserver(2);
    const joined = await observePageservers(h.deps, on);
    expect(joined.newlyActive).toEqual([2]);
    expect(joined.rebalanceOperation).toMatch(/^op_/);
    const operation = await h.platform.findOperation(
      joined.rebalanceOperation as string,
    );
    expect(operation).toMatchObject({
      action: 'pageservers.rebalance',
      params: { reason: 'pageserver-joined', nodeIds: [2] },
    });
    expect((await stats(2))?.activeSeen).toBe(true);

    const again = await observePageservers(h.deps, on);
    expect(again).toEqual({ rebalanceOperation: null, newlyActive: [] });
  });

  it('does not start one when automatic rebalancing is off, but still marks the node seen', async () => {
    const { h, stats } = await setup();
    await h.addPageserver(1);
    h.addShards(1, 8);
    await observePageservers(h.deps, on);
    await h.addPageserver(2);
    const result = await observePageservers(h.deps, { autoRebalance: false });
    expect(result.rebalanceOperation).toBeNull();
    expect((await stats(2))?.activeSeen).toBe(true);
  });

  it('waits when the controller cannot list tenants yet', async () => {
    const { h, stats } = await setup();
    await h.addPageserver(1);
    h.addShards(1, 8);
    await observePageservers(h.deps, on);
    await h.addPageserver(2);
    h.controller.failures.set('listTenants', [
      new StorconError('starting', 'GET', '/', 503),
    ]);
    const first = await observePageservers(h.deps, on);
    expect(first.rebalanceOperation).toBeNull();
    expect((await stats(2))?.activeSeen).toBe(false);
    expect((await stats(2))?.attachedShards).toBeNull();
    expect(h.logs.some((l) => l.includes('tenants unavailable'))).toBe(true);

    expect((await observePageservers(h.deps, on)).rebalanceOperation).toMatch(
      /^op_/,
    );
  });

  it('tries again later when another platform operation is running', async () => {
    const { h, stats } = await setup();
    await h.addPageserver(1);
    h.addShards(1, 8);
    await observePageservers(h.deps, on);
    await h.addPageserver(2);
    const busy = await h.platform.createOperation({
      action: 'safekeepers.spread',
      params: {},
    });
    expect(
      (await observePageservers(h.deps, on)).rebalanceOperation,
    ).toBeNull();
    expect((await stats(2))?.activeSeen).toBe(false);

    const record = h.platform.operations.get(busy.id);
    if (record) record.status = 'finished';
    expect((await observePageservers(h.deps, on)).rebalanceOperation).toMatch(
      /^op_/,
    );
  });

  it('ignores pageservers that are not Active yet', async () => {
    const { h, stats } = await setup();
    await h.addPageserver(1);
    h.addShards(1, 8);
    await observePageservers(h.deps, on);
    await h.addPageserver(2, { availability: 'WarmingUp' });
    expect((await observePageservers(h.deps, on)).newlyActive).toEqual([]);
    expect((await stats(2))?.activeSeen).toBe(false);
  });
});
