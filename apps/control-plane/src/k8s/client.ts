import {
  CoreV1Api,
  CustomObjectsApi,
  DiscoveryV1Api,
  KubeConfig,
} from '@kubernetes/client-node';

export interface KubeClients {
  /** Pods in `neon-compute`, Services in `libsql`, and node reads. */
  core: CoreV1Api;
  /** EndpointSlices of the per-node `sqld-node-N` Services. */
  discovery: DiscoveryV1Api;
  /** Traefik `IngressRoute` objects (group `traefik.io`). */
  custom: CustomObjectsApi;
}

/**
 * Builds API clients from the in-cluster service account, or from the local
 * kubeconfig when run outside a cluster. Construction makes no network call.
 */
export function createKubeClients(): KubeClients {
  const config = new KubeConfig();
  config.loadFromDefault();
  return {
    core: config.makeApiClient(CoreV1Api),
    discovery: config.makeApiClient(DiscoveryV1Api),
    custom: config.makeApiClient(CustomObjectsApi),
  };
}
