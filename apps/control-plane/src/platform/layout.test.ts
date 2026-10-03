import { describe, expect, it } from 'vitest';
import {
  type LayoutNode,
  type LayoutSafekeeper,
  planSafekeeperLayout,
} from './layout.js';

const GB = 1024 ** 3;
const node = (id: number, overrides: Partial<LayoutNode> = {}): LayoutNode => ({
  id,
  eligible: true,
  ready: true,
  freeBytes: 100 * GB,
  ...overrides,
});
const sk = (id: number, nodeId: number): LayoutSafekeeper => ({ id, nodeId });
const plan = (
  nodes: LayoutNode[],
  safekeepers: LayoutSafekeeper[] = [],
  count = 3,
) => planSafekeeperLayout({ nodes, safekeepers, count });

describe('a fresh cluster', () => {
  it('puts all three safekeepers on the only node', () => {
    expect(plan([node(1)])).toMatchObject({
      create: [1, 1, 1],
      move: null,
      blocked: null,
      target: { 1: 3 },
    });
  });

  it('puts two on the roomier of two nodes and one on the other', () => {
    const result = plan([node(1), node(2, { freeBytes: 200 * GB })]);
    expect(result.create.toSorted()).toEqual([1, 2, 2]);
    expect(result.target).toEqual({ 1: 1, 2: 2 });
  });

  it('puts one on each of three nodes', () => {
    expect(plan([node(1), node(2), node(3)]).create.toSorted()).toEqual([
      1, 2, 3,
    ]);
  });

  it('picks the three roomiest of five nodes', () => {
    const nodes = [
      node(1, { freeBytes: 10 * GB }),
      node(2, { freeBytes: 500 * GB }),
      node(3, { freeBytes: 300 * GB }),
      node(4, { freeBytes: 400 * GB }),
      node(5, { freeBytes: 20 * GB }),
    ];
    expect(plan(nodes).create.toSorted()).toEqual([2, 3, 4]);
  });

  it('breaks capacity ties by the lowest node id', () => {
    expect(
      plan([node(3), node(1), node(2), node(4)]).create.toSorted(),
    ).toEqual([1, 2, 3]);
  });

  it('ignores nodes that are not eligible or not Ready', () => {
    const nodes = [
      node(1, { eligible: false }),
      node(2, { ready: false }),
      node(3),
    ];
    expect(plan(nodes).create).toEqual([3, 3, 3]);
  });

  it('is blocked, not wrong, when no node can host a safekeeper', () => {
    const result = plan([
      node(1, { eligible: false }),
      node(2, { ready: false }),
    ]);
    expect(result).toMatchObject({ create: [], move: null });
    expect(result.blocked).toMatch(/no eligible node/);
    expect(plan([]).blocked).not.toBeNull();
  });
});

describe('growing the cluster', () => {
  const onOne = [sk(1, 1), sk(2, 1), sk(3, 1)];

  it('moves one safekeeper to the second node, then stops', () => {
    const first = plan([node(1), node(2)], onOne);
    expect(first.create).toEqual([]);
    expect(first.move).toEqual({ remove: 3, fromNodeId: 1, toNodeId: 2 });
    // After the move the layout is 2 + 1 and stable.
    expect(
      plan([node(1), node(2)], [sk(1, 1), sk(2, 1), sk(4, 2)]).move,
    ).toBeNull();
  });

  it('moves one safekeeper per plan towards one per node', () => {
    const nodes = [node(1), node(2), node(3, { freeBytes: 300 * GB })];
    const first = plan(nodes, onOne);
    expect(first.move).toEqual({ remove: 3, fromNodeId: 1, toNodeId: 3 });
    const second = plan(nodes, [sk(1, 1), sk(2, 1), sk(4, 3)]);
    expect(second.move).toEqual({ remove: 2, fromNodeId: 1, toNodeId: 2 });
    expect(plan(nodes, [sk(1, 1), sk(5, 2), sk(4, 3)]).move).toBeNull();
  });

  it('leaves a balanced fleet alone when a roomier node joins', () => {
    const nodes = [node(1), node(2), node(3), node(4, { freeBytes: 900 * GB })];
    expect(plan(nodes, [sk(1, 1), sk(2, 2), sk(3, 3)]).move).toBeNull();
  });

  it('keeps the node that already holds the larger share on two nodes', () => {
    // Node 1 has more free space but node 2 already holds two: no churn.
    const nodes = [node(1, { freeBytes: 900 * GB }), node(2)];
    expect(plan(nodes, [sk(1, 1), sk(2, 2), sk(3, 2)]).move).toBeNull();
  });

  it('never plans a move and a creation together', () => {
    const result = plan([node(1), node(2)], [sk(1, 1), sk(2, 1)]);
    expect(result.create).toEqual([2]);
    expect(result.move).toBeNull();
  });
});

describe('converging from one node', () => {
  // Applies each planned move the way a spread operation would.
  function settle(nodeCount: number) {
    const nodes = Array.from({ length: nodeCount }, (_, i) =>
      node(i + 1, { freeBytes: (100 + i) * GB }),
    );
    let fleet = [sk(1, 1), sk(2, 1), sk(3, 1)];
    let nextId = 4;
    let moves = 0;
    for (let guard = 0; guard < 10; guard++) {
      const { move } = plan(nodes, fleet);
      if (!move) break;
      moves += 1;
      fleet = fleet
        .filter((s) => s.id !== move.remove)
        .concat(sk(nextId++, move.toNodeId));
    }
    const perNode = nodes
      .map((n) => fleet.filter((s) => s.nodeId === n.id).length)
      .sort();
    return { moves, perNode };
  }

  it.each([
    [1, 0, [3]],
    [2, 1, [1, 2]],
    [3, 2, [1, 1, 1]],
    [4, 2, [0, 1, 1, 1]],
    [6, 2, [0, 0, 0, 1, 1, 1]],
  ])('%i node(s) take %i move(s)', (nodeCount, moves, perNode) => {
    expect(settle(nodeCount)).toEqual({ moves, perNode });
  });
});

describe('trouble', () => {
  it('replaces a safekeeper that was lost', () => {
    const nodes = [node(1), node(2), node(3)];
    const result = plan(nodes, [sk(1, 1), sk(2, 2)]);
    expect(result.create).toEqual([3]);
    expect(result.move).toBeNull();
  });

  it('evacuates a node whose label was removed', () => {
    const nodes = [node(1), node(2, { eligible: false }), node(3), node(4)];
    const result = plan(nodes, [sk(1, 1), sk(2, 2), sk(3, 3)]);
    expect(result.move).toEqual({ remove: 2, fromNodeId: 2, toNodeId: 4 });
  });

  it('does not move safekeepers off a node that is not Ready', () => {
    const nodes = [node(1), node(2, { ready: false }), node(3), node(4)];
    const result = plan(nodes, [sk(1, 1), sk(2, 2), sk(3, 3)]);
    expect(result.move).toBeNull();
    expect(result.create).toEqual([]);
    expect(result.stranded).toEqual([2]);
  });

  it('reports a safekeeper whose node is gone as stranded, without replacing it', () => {
    const result = plan([node(1), node(3)], [sk(1, 1), sk(2, 9), sk(3, 3)]);
    expect(result.stranded).toEqual([2]);
    expect(result.create).toEqual([]);
    expect(result.move).toBeNull();
  });

  it('spreads the rest around a stranded safekeeper', () => {
    // One stays on the missing node 9; two more spread over nodes 1 and 2.
    const result = plan([node(1), node(2)], [sk(1, 9)]);
    expect(result.create.toSorted()).toEqual([1, 2]);
  });
});
