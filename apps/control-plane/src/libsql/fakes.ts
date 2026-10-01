import { type SqldAdminClient, SqldAdminError } from './admin-client.js';
import type { LibsqlKube, LibsqlRoute } from './kube.js';

/**
 * In-memory stand-ins for sqld's admin API and the Kubernetes objects. They
 * keep real state (which namespaces exist, which routes are applied) so tests
 * can assert idempotence, and record calls so tests can assert order.
 */

export interface FakeAdmin extends SqldAdminClient {
  /** `<node ip>/<namespace>` of every namespace that exists. */
  namespaces: Set<string>;
  calls: string[];
  /** Fails the next call of the named method with this status (null = unreachable). */
  failNext: Map<string, number | null>;
  lastCreate: { maxDbSizeBytes?: number } | undefined;
  lastFork: { timestamp?: Date } | undefined;
  lastDelete: { keepBackup?: boolean } | undefined;
}

export function createFakeAdmin(): FakeAdmin {
  const fake: FakeAdmin = {
    namespaces: new Set(),
    calls: [],
    failNext: new Map(),
    lastCreate: undefined,
    lastFork: undefined,
    lastDelete: undefined,
    async createNamespace(ip, namespace, options) {
      fake.calls.push(`create ${ip} ${namespace}`);
      fake.lastCreate = options;
      scriptedFailure('createNamespace');
      const key = `${ip}/${namespace}`;
      if (fake.namespaces.has(key)) return 'exists';
      fake.namespaces.add(key);
      return 'created';
    },
    async forkNamespace(ip, from, to, timestamp) {
      fake.calls.push(`fork ${ip} ${from} ${to}`);
      fake.lastFork = { timestamp };
      scriptedFailure('forkNamespace');
      if (!fake.namespaces.has(`${ip}/${from}`)) {
        throw new SqldAdminError(`Namespace \`${from}\` doesn't exist`, 404);
      }
      const key = `${ip}/${to}`;
      if (fake.namespaces.has(key)) return 'exists';
      fake.namespaces.add(key);
      return 'forked';
    },
    async deleteNamespace(ip, namespace, options) {
      fake.calls.push(`delete ${ip} ${namespace}`);
      fake.lastDelete = options;
      scriptedFailure('deleteNamespace');
      return fake.namespaces.delete(`${ip}/${namespace}`)
        ? 'deleted'
        : 'missing';
    },
  };
  function scriptedFailure(method: string) {
    if (!fake.failNext.has(method)) return;
    const status = fake.failNext.get(method) ?? null;
    fake.failNext.delete(method);
    throw new SqldAdminError(`scripted failure of ${method}`, status);
  }
  return fake;
}

export interface FakeLibsqlKube extends LibsqlKube {
  services: Map<number, string>;
  routes: Map<string, LibsqlRoute>;
  calls: string[];
}

export function createFakeLibsqlKube(): FakeLibsqlKube {
  const fake: FakeLibsqlKube = {
    services: new Map(),
    routes: new Map(),
    calls: [],
    async ensureNodeService(nodeId, ip) {
      fake.calls.push(`service ${nodeId} ${ip}`);
      fake.services.set(nodeId, ip);
    },
    async ensureRoute(route) {
      fake.calls.push(`route ${route.namespace}`);
      fake.routes.set(route.namespace, route);
    },
    async deleteRoute(namespace) {
      fake.calls.push(`unroute ${namespace}`);
      fake.routes.delete(namespace);
    },
  };
  return fake;
}
