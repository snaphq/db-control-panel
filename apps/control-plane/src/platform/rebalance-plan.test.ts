import { describe, expect, it } from 'vitest';
import {
  type RebalanceNode,
  type RebalanceShard,
  planRebalance,
} from './rebalance-plan.js';

const node = (
  id: number,
  overrides: Partial<RebalanceNode> = {},
): RebalanceNode => ({
  id,
  az: `az-${id}`,
  eligible: true,
  ...overrides,
});
const shards = (
  nodeId: number | null,
  count: number,
  options: { busy?: boolean; prefix?: string } = {},
): RebalanceShard[] =>
  Array.from({ length: count }, (_, i) => {
    const id = `${options.prefix ?? `n${nodeId}`}-${String(i).padStart(3, '0')}`;
    return { shardId: id, tenantId: id, nodeId, busy: options.busy ?? false };
  });
const plan = (nodes: RebalanceNode[], all: RebalanceShard[], maxMoves = 100) =>
  planRebalance({ nodes, shards: all, maxMoves });

describe('planRebalance', () => {
  it('moves half the tenants to an empty new pageserver', () => {
    const result = plan([node(1), node(2)], shards(1, 10));
    expect(result.moves).toHaveLength(5);
    expect(
      result.moves.every((m) => m.fromNodeId === 1 && m.toNodeId === 2),
    ).toBe(true);
    expect(result.before).toEqual({ 1: 10, 2: 0 });
    expect(result.after).toEqual({ 1: 5, 2: 5 });
    expect(result.balanced).toBe(true);
  });

  it('leaves a difference of one tenant alone', () => {
    expect(
      plan([node(1), node(2)], [...shards(1, 5), ...shards(2, 4)]),
    ).toMatchObject({
      moves: [],
      balanced: true,
    });
    expect(
      plan([node(1), node(2)], [...shards(1, 6), ...shards(2, 4)]).moves,
    ).toHaveLength(1);
  });

  it('evens out three pageservers when one joins empty', () => {
    const result = plan(
      [node(1), node(2), node(3)],
      [...shards(1, 6), ...shards(2, 6)],
    );
    expect(result.after).toEqual({ 1: 4, 2: 4, 3: 4 });
    expect(result.moves.every((m) => m.toNodeId === 3)).toBe(true);
    expect(result.moves).toHaveLength(4);
  });

  it('stops at the cap and says it is not balanced yet', () => {
    const result = plan([node(1), node(2)], shards(1, 10), 3);
    expect(result.moves).toHaveLength(3);
    expect(result.balanced).toBe(false);
    expect(result.after).toEqual({ 1: 7, 2: 3 });
  });

  it('skips busy tenants but still counts them as load', () => {
    const busy = shards(1, 2, { busy: true, prefix: 'busy' });
    const free = shards(1, 2, { prefix: 'free' });
    const result = plan([node(1), node(2)], [...busy, ...free]);
    expect(result.moves.map((m) => m.shardId).sort()).toEqual([
      'free-000',
      'free-001',
    ]);
    expect(result.before).toEqual({ 1: 4, 2: 0 });
    expect(result.after).toEqual({ 1: 2, 2: 2 });
  });

  it('plans nothing when every tenant is busy', () => {
    const result = plan([node(1), node(2)], shards(1, 6, { busy: true }));
    expect(result.moves).toEqual([]);
    expect(result.balanced).toBe(true);
  });

  it('ignores pageservers that are not Active, as source and as destination', () => {
    const nodes = [node(1), node(2), node(3, { eligible: false })];
    const result = plan(nodes, [...shards(1, 4), ...shards(3, 10)]);
    expect(result.before).toEqual({ 1: 4, 2: 0 });
    expect(
      result.moves.every((m) => m.fromNodeId === 1 && m.toNodeId === 2),
    ).toBe(true);
  });

  it('ignores detached shards and shards on unknown nodes', () => {
    const result = plan(
      [node(1), node(2)],
      [...shards(null, 5), ...shards(99, 5), ...shards(1, 2)],
    );
    expect(result.before).toEqual({ 1: 2, 2: 0 });
    expect(result.moves).toHaveLength(1);
  });

  it('weights nodes by capacity', () => {
    const result = plan(
      [node(1, { weight: 2 }), node(2, { weight: 1 })],
      shards(1, 9),
    );
    expect(result.after).toEqual({ 1: 6, 2: 3 });
  });

  it('is deterministic: lowest shard id first, ties to the lowest node id', () => {
    const first = plan([node(1), node(2)], shards(1, 4));
    const again = plan([node(2), node(1)], [...shards(1, 4)].reverse());
    expect(again.moves).toEqual(first.moves);
    expect(first.moves.map((m) => m.shardId)).toEqual(['n1-000', 'n1-001']);
  });

  it('handles an empty cluster', () => {
    expect(plan([], [])).toEqual({
      moves: [],
      before: {},
      after: {},
      balanced: true,
    });
    expect(plan([node(1)], shards(1, 3)).moves).toEqual([]);
  });
});
