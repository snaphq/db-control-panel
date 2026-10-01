import { describe, expect, it } from 'vitest';
import {
  buildIngressRoute,
  buildNodeEndpointSlice,
  buildNodeService,
  createLibsqlKube,
  nodeServiceName,
} from './kube.js';

class ApiError extends Error {
  constructor(readonly code: number) {
    super(`HTTP ${code}`);
  }
}

/** The slice of the Kubernetes client the code uses, backed by maps. */
function fakeCluster() {
  const services = new Map<string, unknown>();
  const slices = new Map<
    string,
    { resourceVersion?: string } & Record<string, unknown>
  >();
  const routes = new Map<string, Record<string, unknown>>();
  const calls: string[] = [];
  let version = 0;
  const getOr404 = <T>(map: Map<string, T>, name: string): T => {
    const found = map.get(name);
    if (!found) throw new ApiError(404);
    return found;
  };
  const kube = {
    core: {
      async readNamespacedService({ name }: { name: string }) {
        return getOr404(services, name);
      },
      async createNamespacedService({
        body,
      }: { body: { metadata: { name: string } } }) {
        calls.push(`create service ${body.metadata.name}`);
        if (services.has(body.metadata.name)) throw new ApiError(409);
        services.set(body.metadata.name, body);
        return body;
      },
    },
    discovery: {
      async readNamespacedEndpointSlice({ name }: { name: string }) {
        const found = getOr404(slices, name);
        return {
          ...found,
          metadata: {
            ...(found.metadata as object),
            resourceVersion: found.resourceVersion,
          },
        };
      },
      async createNamespacedEndpointSlice({
        body,
      }: { body: { metadata: { name: string } } & Record<string, unknown> }) {
        calls.push(`create slice ${body.metadata.name}`);
        if (slices.has(body.metadata.name)) throw new ApiError(409);
        slices.set(body.metadata.name, {
          ...body,
          resourceVersion: String(++version),
        });
        return body;
      },
      async replaceNamespacedEndpointSlice({
        name,
        body,
      }: {
        name: string;
        body: { metadata: { resourceVersion?: string } } & Record<
          string,
          unknown
        >;
      }) {
        calls.push(`replace slice ${name} rv=${body.metadata.resourceVersion}`);
        slices.set(name, { ...body, resourceVersion: String(++version) });
      },
    },
    custom: {
      async getNamespacedCustomObject({ name }: { name: string }) {
        const found = getOr404(routes, name);
        return found;
      },
      async createNamespacedCustomObject({
        body,
      }: { body: { metadata: { name: string } } & Record<string, unknown> }) {
        calls.push(`create route ${body.metadata.name}`);
        if (routes.has(body.metadata.name)) throw new ApiError(409);
        routes.set(body.metadata.name, {
          ...body,
          metadata: { ...body.metadata, resourceVersion: String(++version) },
        });
      },
      async replaceNamespacedCustomObject({
        name,
        body,
      }: {
        name: string;
        body: { metadata: { resourceVersion?: string } } & Record<
          string,
          unknown
        >;
      }) {
        calls.push(`replace route ${name} rv=${body.metadata.resourceVersion}`);
        routes.set(name, body);
      },
      async deleteNamespacedCustomObject({ name }: { name: string }) {
        calls.push(`delete route ${name}`);
        getOr404(routes, name);
        routes.delete(name);
      },
    },
  };
  return { kube, services, slices, routes, calls };
}

const make = () => {
  const cluster = fakeCluster();
  // biome-ignore lint/suspicious/noExplicitAny: a structural fake of the generated client
  return { ...cluster, libsql: createLibsqlKube(cluster.kube as any) };
};

describe('manifests', () => {
  it('builds a selector-less Service on 8080', () => {
    const service = buildNodeService(7);
    expect(service.metadata).toMatchObject({
      name: 'sqld-node-7',
      namespace: 'libsql',
    });
    expect(service.spec?.selector).toBeUndefined();
    expect(service.spec?.ports).toEqual([
      { name: 'http', port: 8080, targetPort: 8080, protocol: 'TCP' },
    ]);
  });

  it('points the EndpointSlice at the Tailscale IP and ties it to the Service', () => {
    const slice = buildNodeEndpointSlice(7, '100.64.0.7');
    expect(slice.addressType).toBe('IPv4');
    expect(slice.endpoints).toEqual([
      { addresses: ['100.64.0.7'], conditions: { ready: true } },
    ]);
    expect(slice.ports).toEqual([
      { name: 'http', port: 8080, protocol: 'TCP' },
    ]);
    expect(slice.metadata?.labels).toMatchObject({
      'kubernetes.io/service-name': 'sqld-node-7',
      'endpointslice.kubernetes.io/managed-by': 'alloydb-control-plane',
    });
    expect(buildNodeEndpointSlice(7, 'fd7a::7').addressType).toBe('IPv6');
  });

  it('routes the wildcard host of one database to its node Service over TLS', () => {
    const route = buildIngressRoute({
      namespace: 'orders-acme',
      host: 'orders-acme.lite.alloydb.net',
      nodeId: 7,
    });
    expect(route).toMatchObject({
      apiVersion: 'traefik.io/v1alpha1',
      kind: 'IngressRoute',
      metadata: { name: 'orders-acme', namespace: 'libsql' },
      spec: {
        entryPoints: ['websecure'],
        routes: [
          {
            kind: 'Rule',
            match: 'Host(`orders-acme.lite.alloydb.net`)',
            services: [{ name: 'sqld-node-7', port: 8080 }],
          },
        ],
        tls: { secretName: 'lite-wildcard-tls' },
      },
    });
    expect(nodeServiceName(7)).toBe('sqld-node-7');
  });
});

describe('ensureNodeService', () => {
  it('creates the Service and EndpointSlice once', async () => {
    const t = make();
    await t.libsql.ensureNodeService(7, '100.64.0.7');
    await t.libsql.ensureNodeService(7, '100.64.0.7');
    expect(t.calls).toEqual([
      'create service sqld-node-7',
      'create slice sqld-node-7',
    ]);
  });

  it('corrects a slice whose node address changed, using its resourceVersion', async () => {
    const t = make();
    await t.libsql.ensureNodeService(7, '100.64.0.7');
    await t.libsql.ensureNodeService(7, '100.64.0.99');
    expect(t.calls.at(-1)).toMatch(/^replace slice sqld-node-7 rv=\d+$/);
    expect(
      (t.slices.get('sqld-node-7')?.endpoints as { addresses: string[] }[])[0]
        ?.addresses,
    ).toEqual(['100.64.0.99']);
  });

  it('keeps one Service per node', async () => {
    const t = make();
    await t.libsql.ensureNodeService(1, '100.64.0.1');
    await t.libsql.ensureNodeService(2, '100.64.0.2');
    expect([...t.services.keys()].sort()).toEqual([
      'sqld-node-1',
      'sqld-node-2',
    ]);
  });
});

describe('routes', () => {
  const route = {
    namespace: 'orders-acme',
    host: 'orders-acme.lite.alloydb.net',
    nodeId: 7,
  };

  it('creates a route once and leaves an identical one alone', async () => {
    const t = make();
    await t.libsql.ensureRoute(route);
    await t.libsql.ensureRoute(route);
    expect(t.calls).toEqual(['create route orders-acme']);
  });

  it('moves a route that points at another node', async () => {
    const t = make();
    await t.libsql.ensureRoute(route);
    await t.libsql.ensureRoute({ ...route, nodeId: 8 });
    expect(t.calls.at(-1)).toMatch(/^replace route orders-acme rv=\d+$/);
    const spec = t.routes.get('orders-acme')?.spec as ReturnType<
      typeof buildIngressRoute
    >['spec'];
    expect(spec.routes[0]?.services[0]?.name).toBe('sqld-node-8');
  });

  it('ignores defaults the API server adds to the stored route', async () => {
    const t = make();
    await t.libsql.ensureRoute(route);
    const stored = t.routes.get('orders-acme') as {
      spec: { routes: { services: Record<string, unknown>[] }[] };
    };
    stored.spec.routes[0]?.services[0] &&
      Object.assign(stored.spec.routes[0].services[0], {
        weight: 1,
        scheme: 'http',
      });
    await t.libsql.ensureRoute(route);
    expect(t.calls).toEqual(['create route orders-acme']);
  });

  it('deletes a route and tolerates one that is already gone', async () => {
    const t = make();
    await t.libsql.ensureRoute(route);
    await t.libsql.deleteRoute('orders-acme');
    await t.libsql.deleteRoute('orders-acme');
    expect(t.routes.size).toBe(0);
  });

  it('surfaces errors other than "not found"', async () => {
    const t = make();
    t.kube.custom.getNamespacedCustomObject = async () => {
      throw new ApiError(403);
    };
    await expect(t.libsql.ensureRoute(route)).rejects.toMatchObject({
      code: 403,
    });
  });
});
