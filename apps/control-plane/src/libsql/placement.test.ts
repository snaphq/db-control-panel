import { describe, expect, it } from 'vitest';
import type { NodeRow } from '../neon/store.js';
import { freeShare, pickLibsqlNode } from './placement.js';

const NOW = new Date('2026-01-01T00:00:00Z');

function node(id: number, overrides: Partial<NodeRow> = {}): NodeRow {
  return {
    id,
    name: `node-${id}`,
    tailscaleIp: `100.64.0.${id}`,
    zone: `az-${id}`,
    roles: ['libsql'],
    capacity: {},
    registeredPageserver: false,
    registeredSafekeepers: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const counts = (entries: [number, number][]) => new Map(entries);

describe('pickLibsqlNode', () => {
  it('prefers the node with the most free share', () => {
    const picked = pickLibsqlNode(
      [node(1), node(2), node(3)],
      counts([
        [1, 150],
        [2, 20],
        [3, 90],
      ]),
    );
    expect(picked?.id).toBe(2);
  });

  it('compares shares, not counts, when capacities differ', () => {
    const small = node(1, { capacity: { libsqlMaxDatabases: 10 } });
    const large = node(2);
    // 5 of 10 used leaves 50%; 100 of 200 used also leaves 50%; 99 leaves more.
    expect(
      pickLibsqlNode(
        [small, large],
        counts([
          [1, 5],
          [2, 99],
        ]),
      )?.id,
    ).toBe(2);
    expect(
      pickLibsqlNode(
        [small, large],
        counts([
          [1, 1],
          [2, 99],
        ]),
      )?.id,
    ).toBe(1);
  });

  it('breaks ties by the lowest node id', () => {
    expect(pickLibsqlNode([node(3), node(2)], counts([]))?.id).toBe(2);
  });

  it('skips nodes without the libsql role', () => {
    expect(
      pickLibsqlNode(
        [node(1, { roles: ['compute', 'pageserver'] }), node(2)],
        counts([]),
      )?.id,
    ).toBe(2);
  });

  it('skips nodes that are not ready', () => {
    expect(
      pickLibsqlNode(
        [node(1, { capacity: { ready: false } }), node(2)],
        counts([]),
      )?.id,
    ).toBe(2);
  });

  it('skips full nodes and returns null when every node is full', () => {
    const full = counts([
      [1, 200],
      [2, 250],
    ]);
    expect(pickLibsqlNode([node(1), node(2)], full)).toBeNull();
    expect(pickLibsqlNode([node(1), node(2)], counts([[1, 200]]))?.id).toBe(2);
  });

  it('returns null without any libsql node', () => {
    expect(pickLibsqlNode([], counts([]))).toBeNull();
  });

  it('ignores a nonsensical configured capacity', () => {
    const odd = node(1, { capacity: { libsqlMaxDatabases: -5 } });
    expect(freeShare(odd, 100)).toBe(0.5);
  });
});
