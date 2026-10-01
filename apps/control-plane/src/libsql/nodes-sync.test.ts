import type { V1Node } from '@kubernetes/client-node';
import { describe, expect, it } from 'vitest';
import { createMemoryNeonStore } from '../neon/store-memory.js';
import { parseNode, syncNodes } from './nodes-sync.js';

function k8sNode(
  name: string,
  options: {
    id?: string;
    ip?: string;
    annotation?: string;
    roles?: string[];
    zone?: string;
    ready?: boolean;
  } = {},
): V1Node {
  const labels: Record<string, string> = {};
  if (options.id !== undefined) labels['alloydb.net/node-id'] = options.id;
  if (options.zone) labels['topology.kubernetes.io/zone'] = options.zone;
  for (const role of options.roles ?? [])
    labels[`alloydb.net/${role}`] = 'true';
  return {
    metadata: {
      name,
      labels,
      annotations: options.annotation
        ? { 'alloydb.net/tailscale-ip': options.annotation }
        : undefined,
    },
    status: {
      addresses: options.ip
        ? [{ type: 'InternalIP', address: options.ip }]
        : [],
      conditions: [
        { type: 'Ready', status: options.ready === false ? 'False' : 'True' },
      ],
    },
  } as V1Node;
}

const source = (items: V1Node[]) => ({ listNode: async () => ({ items }) });
const quiet = { warn: () => {} };

describe('parseNode', () => {
  it('reads the id, address, zone, roles and readiness', () => {
    expect(
      parseNode(
        k8sNode('n1', {
          id: '3',
          ip: '100.64.0.3',
          zone: 'az-2',
          roles: ['libsql', 'compute'],
        }),
      ),
    ).toEqual({
      id: 3,
      name: 'n1',
      tailscaleIp: '100.64.0.3',
      zone: 'az-2',
      roles: ['libsql', 'compute'],
      ready: true,
    });
  });

  it('prefers the annotated Tailscale address over InternalIP', () => {
    const parsed = parseNode(
      k8sNode('n1', { id: '3', ip: '10.0.0.3', annotation: '100.64.0.3' }),
    );
    expect(parsed).toMatchObject({ tailscaleIp: '100.64.0.3' });
  });

  it('only counts roles whose label is exactly "true"', () => {
    const node = k8sNode('n1', { id: '3', ip: '1.2.3.4', roles: ['libsql'] });
    if (node.metadata?.labels)
      node.metadata.labels['alloydb.net/compute'] = 'false';
    expect(parseNode(node)).toMatchObject({ roles: ['libsql'] });
  });

  it.each([
    ['no id label', k8sNode('n', { ip: '1.2.3.4' })],
    ['a non-numeric id', k8sNode('n', { id: 'x', ip: '1.2.3.4' })],
    ['id zero', k8sNode('n', { id: '0', ip: '1.2.3.4' })],
    ['no address', k8sNode('n', { id: '1' })],
  ])('skips a node with %s', (_what, node) => {
    expect(typeof parseNode(node)).toBe('string');
  });
});

describe('syncNodes', () => {
  it('fills the node table with every role, not only libsql', async () => {
    const store = createMemoryNeonStore();
    const result = await syncNodes(
      source([
        k8sNode('a', {
          id: '1',
          ip: '100.64.0.1',
          roles: ['pageserver', 'compute'],
          zone: 'az-1',
        }),
        k8sNode('b', {
          id: '2',
          ip: '100.64.0.2',
          roles: ['libsql'],
          zone: 'az-2',
        }),
      ]),
      store,
      quiet,
    );
    expect(result.synced).toEqual([1, 2]);
    const nodes = await store.listNodes();
    expect(nodes.map((n) => [n.id, n.roles, n.tailscaleIp, n.zone])).toEqual([
      [1, ['pageserver', 'compute'], '100.64.0.1', 'az-1'],
      [2, ['libsql'], '100.64.0.2', 'az-2'],
    ]);
    expect(nodes.every((n) => n.capacity.ready === true)).toBe(true);
  });

  it('follows label changes and readiness', async () => {
    const store = createMemoryNeonStore();
    await syncNodes(
      source([
        k8sNode('b', {
          id: '2',
          ip: '100.64.0.2',
          roles: ['libsql', 'compute'],
        }),
      ]),
      store,
      quiet,
    );
    await syncNodes(
      source([
        k8sNode('b', {
          id: '2',
          ip: '100.64.0.2',
          roles: ['compute'],
          ready: false,
        }),
      ]),
      store,
      quiet,
    );
    const node = (await store.listNodes())[0];
    expect(node?.roles).toEqual(['compute']);
    expect(node?.capacity).toEqual({ ready: false });
  });

  it('keeps what other jobs recorded about the node', async () => {
    const store = createMemoryNeonStore();
    await store.upsertNode({
      id: 1,
      name: 'pageserver-1',
      tailscaleIp: '100.64.0.1',
      zone: 'az-1',
      addRoles: ['pageserver'],
      registeredPageserver: true,
    });
    await syncNodes(
      source([
        k8sNode('a', { id: '1', ip: '100.64.0.1', roles: ['pageserver'] }),
      ]),
      store,
      quiet,
    );
    expect((await store.listNodes())[0]).toMatchObject({
      name: 'a',
      registeredPageserver: true,
    });
  });

  it('skips nodes it cannot place and reports duplicates', async () => {
    const store = createMemoryNeonStore();
    const warnings: string[] = [];
    const result = await syncNodes(
      source([
        k8sNode('server', { ip: '100.64.0.9' }),
        k8sNode('a', { id: '1', ip: '100.64.0.1' }),
        k8sNode('dup', { id: '1', ip: '100.64.0.2' }),
      ]),
      store,
      { warn: (m) => warnings.push(m) },
    );
    expect(result.synced).toEqual([1]);
    expect(result.skipped).toHaveLength(2);
    expect(warnings[0]).toMatch(/already used by a/);
    expect((await store.listNodes())[0]?.name).toBe('a');
  });
});
