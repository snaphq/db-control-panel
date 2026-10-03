import { describe, expect, it } from 'vitest';
import type { NodeRow } from '../neon/store.js';
import { readClusterNodes } from './cluster.js';

const GB = 1024 ** 3;
const row = (
  id: number,
  roles: string[],
  capacity: NodeRow['capacity'] = {},
): NodeRow => ({
  id,
  name: `node-${id}`,
  tailscaleIp: `100.64.0.${id}`,
  zone: `az-${id}`,
  roles,
  capacity,
  registeredPageserver: false,
  registeredSafekeepers: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

describe('readClusterNodes', () => {
  it('lets only pageserver-role nodes host safekeepers', () => {
    const { nodes } = readClusterNodes(
      [row(1, ['pageserver', 'compute']), row(2, ['libsql'])],
      [],
      50 * GB,
    );
    expect(nodes.map((n) => [n.id, n.eligible])).toEqual([
      [1, true],
      [2, false],
    ]);
  });

  it('reads readiness and treats an unreported node as Ready', () => {
    const { nodes } = readClusterNodes(
      [row(1, ['pageserver'], { ready: false }), row(2, ['pageserver'])],
      [],
      50 * GB,
    );
    expect(nodes.map((n) => n.ready)).toEqual([false, true]);
  });

  it('leaves out nodes that left the cluster', () => {
    const { nodes, hostnames } = readClusterNodes(
      [
        row(1, ['pageserver'], { ready: false, missing: true }),
        row(2, ['pageserver']),
      ],
      [],
      50 * GB,
    );
    expect(nodes.map((n) => n.id)).toEqual([2]);
    expect([...hostnames.keys()]).toEqual([2]);
  });

  it('estimates free space as allocatable storage less what safekeepers claim', () => {
    const { nodes } = readClusterNodes(
      [
        row(1, ['pageserver'], { allocatable: { storageBytes: 500 * GB } }),
        row(2, ['pageserver'], { allocatable: { storageBytes: 500 * GB } }),
        row(3, ['pageserver']),
      ],
      [{ nodeId: 1 }, { nodeId: 1 }, { nodeId: 2 }],
      50 * GB,
    );
    expect(nodes.map((n) => n.freeBytes / GB)).toEqual([400, 450, 0]);
  });

  it('uses the hostname label for scheduling and falls back to the node name', () => {
    const { hostnames } = readClusterNodes(
      [row(1, ['pageserver'], { hostname: 'hel-1' }), row(2, ['pageserver'])],
      [],
      50 * GB,
    );
    expect(hostnames.get(1)).toBe('hel-1');
    expect(hostnames.get(2)).toBe('node-2');
  });
});
