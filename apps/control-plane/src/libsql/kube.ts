import type { V1EndpointSlice, V1Service } from '@kubernetes/client-node';
import type { KubeClients } from '../k8s/client.js';

/**
 * The Kubernetes objects that route `<namespace>.lite.alloydb.net` to the sqld
 * node holding that database (docs-internal/platform/architecture.mdx, "libSQL
 * plane"):
 *
 * - per node, a selector-less Service `sqld-node-<id>` with a hand-managed
 *   EndpointSlice pointing at the node's Tailscale IP (sqld runs on the host
 *   network, so there are no pods to select);
 * - per database, a Traefik IngressRoute in the same namespace, terminating TLS
 *   with `lite-wildcard-tls` (cert-manager, `*.lite.alloydb.net`) and forwarding
 *   to that Service on 8080. sqld reads the namespace from the first Host label.
 */

const LIBSQL_KUBE_NAMESPACE = 'libsql';
const SQLD_HTTP_PORT = 8080;
const LITE_TLS_SECRET = 'lite-wildcard-tls';
const MANAGED_BY = 'alloydb-control-plane';
const ROUTE_GROUP = 'traefik.io';
const ROUTE_VERSION = 'v1alpha1';
const ROUTE_PLURAL = 'ingressroutes';

export const nodeServiceName = (nodeId: number): string =>
  `sqld-node-${nodeId}`;

export interface LibsqlRoute {
  /** The sqld namespace; also the IngressRoute name. */
  namespace: string;
  host: string;
  nodeId: number;
}

export interface LibsqlKube {
  /** Creates the node's Service and EndpointSlice, or fixes the slice when the IP changed. */
  ensureNodeService(nodeId: number, tailscaleIp: string): Promise<void>;
  ensureRoute(route: LibsqlRoute): Promise<void>;
  /** Missing routes are fine: deleting twice is the same as deleting once. */
  deleteRoute(namespace: string): Promise<void>;
}

const labelsFor = (nodeId: number) => ({
  'app.kubernetes.io/name': 'sqld-node',
  'app.kubernetes.io/part-of': 'alloydb',
  'app.kubernetes.io/managed-by': MANAGED_BY,
  'alloydb.net/node-id': String(nodeId),
});

export function buildNodeService(nodeId: number): V1Service {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: nodeServiceName(nodeId),
      namespace: LIBSQL_KUBE_NAMESPACE,
      labels: labelsFor(nodeId),
    },
    // No selector: the EndpointSlice below is maintained by hand.
    spec: {
      type: 'ClusterIP',
      ports: [
        {
          name: 'http',
          port: SQLD_HTTP_PORT,
          targetPort: SQLD_HTTP_PORT,
          protocol: 'TCP',
        },
      ],
    },
  };
}

export function buildNodeEndpointSlice(
  nodeId: number,
  tailscaleIp: string,
): V1EndpointSlice {
  const name = nodeServiceName(nodeId);
  return {
    apiVersion: 'discovery.k8s.io/v1',
    kind: 'EndpointSlice',
    metadata: {
      name,
      namespace: LIBSQL_KUBE_NAMESPACE,
      labels: {
        ...labelsFor(nodeId),
        // Ties the slice to the Service; a managed-by other than the built-in
        // controller's keeps that controller from rewriting it.
        'kubernetes.io/service-name': name,
        'endpointslice.kubernetes.io/managed-by': MANAGED_BY,
      },
    },
    addressType: tailscaleIp.includes(':') ? 'IPv6' : 'IPv4',
    endpoints: [{ addresses: [tailscaleIp], conditions: { ready: true } }],
    ports: [{ name: 'http', port: SQLD_HTTP_PORT, protocol: 'TCP' }],
  };
}

export function buildIngressRoute(route: LibsqlRoute) {
  return {
    apiVersion: `${ROUTE_GROUP}/${ROUTE_VERSION}`,
    kind: 'IngressRoute',
    metadata: {
      name: route.namespace,
      namespace: LIBSQL_KUBE_NAMESPACE,
      labels: {
        'app.kubernetes.io/name': 'libsql-database',
        'app.kubernetes.io/part-of': 'alloydb',
        'app.kubernetes.io/managed-by': MANAGED_BY,
        'alloydb.net/node-id': String(route.nodeId),
      },
    },
    spec: {
      entryPoints: ['websecure'],
      routes: [
        {
          kind: 'Rule',
          match: `Host(\`${route.host}\`)`,
          services: [
            { name: nodeServiceName(route.nodeId), port: SQLD_HTTP_PORT },
          ],
        },
      ],
      tls: { secretName: LITE_TLS_SECRET },
    },
  };
}

type RouteSpec = ReturnType<typeof buildIngressRoute>['spec'];

/** Compares what we set; the API server may add defaults to the rest. */
function sameRoute(have: Partial<RouteSpec> | undefined, want: RouteSpec) {
  const rule = have?.routes?.[0];
  const service = rule?.services?.[0];
  const wantRule = want.routes[0];
  return (
    have?.routes?.length === 1 &&
    rule?.match === wantRule?.match &&
    rule?.services?.length === 1 &&
    service?.name === wantRule?.services[0]?.name &&
    Number(service?.port) === wantRule?.services[0]?.port &&
    have?.tls?.secretName === want.tls.secretName &&
    JSON.stringify(have?.entryPoints) === JSON.stringify(want.entryPoints)
  );
}

const statusOf = (error: unknown): number | undefined =>
  typeof (error as { code?: unknown }).code === 'number'
    ? (error as { code: number }).code
    : undefined;

async function orNull<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read;
  } catch (error) {
    if (statusOf(error) === 404) return null;
    throw error;
  }
}

/** Creates, treating a concurrent create (409) as "someone else got there first". */
async function createIfAbsent(create: Promise<unknown>): Promise<boolean> {
  try {
    await create;
    return true;
  } catch (error) {
    if (statusOf(error) === 409) return false;
    throw error;
  }
}

export function createLibsqlKube(
  kube: Pick<KubeClients, 'core' | 'discovery' | 'custom'>,
): LibsqlKube {
  const namespace = LIBSQL_KUBE_NAMESPACE;
  const customRef = {
    group: ROUTE_GROUP,
    version: ROUTE_VERSION,
    namespace,
    plural: ROUTE_PLURAL,
  };

  return {
    async ensureNodeService(nodeId, tailscaleIp) {
      const name = nodeServiceName(nodeId);
      // Services are created once: their ports never change, and replacing one
      // would fight the API server over the immutable cluster IP.
      const service = await orNull(
        kube.core.readNamespacedService({ name, namespace }),
      );
      if (!service) {
        await createIfAbsent(
          kube.core.createNamespacedService({
            namespace,
            body: buildNodeService(nodeId),
          }),
        );
      }

      const want = buildNodeEndpointSlice(nodeId, tailscaleIp);
      const slice = await orNull(
        kube.discovery.readNamespacedEndpointSlice({ name, namespace }),
      );
      if (!slice) {
        if (
          await createIfAbsent(
            kube.discovery.createNamespacedEndpointSlice({
              namespace,
              body: want,
            }),
          )
        ) {
          return;
        }
        return this.ensureNodeService(nodeId, tailscaleIp);
      }
      const current = slice.endpoints?.flatMap((e) => e.addresses) ?? [];
      if (
        slice.addressType === want.addressType &&
        current.length === 1 &&
        current[0] === tailscaleIp
      ) {
        return;
      }
      await kube.discovery.replaceNamespacedEndpointSlice({
        name,
        namespace,
        body: {
          ...want,
          // addressType is immutable; a change of family needs a delete first.
          metadata: {
            ...want.metadata,
            resourceVersion: slice.metadata?.resourceVersion,
          },
        },
      });
    },

    async ensureRoute(route) {
      const want = buildIngressRoute(route);
      const name = route.namespace;
      const have = (await orNull(
        kube.custom.getNamespacedCustomObject({ ...customRef, name }),
      )) as {
        spec?: Partial<RouteSpec>;
        metadata?: { resourceVersion?: string };
      } | null;
      if (!have) {
        if (
          await createIfAbsent(
            kube.custom.createNamespacedCustomObject({
              ...customRef,
              body: want,
            }),
          )
        ) {
          return;
        }
        return this.ensureRoute(route);
      }
      if (sameRoute(have.spec, want.spec)) return;
      await kube.custom.replaceNamespacedCustomObject({
        ...customRef,
        name,
        body: {
          ...want,
          metadata: {
            ...want.metadata,
            resourceVersion: have.metadata?.resourceVersion,
          },
        },
      });
    },

    async deleteRoute(routeNamespace) {
      try {
        await kube.custom.deleteNamespacedCustomObject({
          ...customRef,
          name: routeNamespace,
        });
      } catch (error) {
        if (statusOf(error) !== 404) throw error;
      }
    },
  };
}
