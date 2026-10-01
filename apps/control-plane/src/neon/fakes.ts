import { generateKeyPairSync } from 'node:crypto';
import type { V1Pod } from '@kubernetes/client-node';
import { type Ed25519Signer, createEd25519Signer } from '../crypto/ed25519.js';
import { newEndpointId, newId, newNeonId } from '../crypto/ids.js';
import { PodAlreadyExistsError, type PodApi } from '../k8s/pods.js';
import {
  type ComputeCtlClient,
  ComputeCtlError,
  type ComputeCtlStatus,
  type ComputeCtlStatusReport,
} from './compute-ctl-client.js';
import type { ComputeConfigResponse } from './spec.js';
import type { LocateResponse, StorconClient } from './storcon-client.js';
import { type MemoryNeonStore, createMemoryNeonStore } from './store-memory.js';
import type { Scope } from './store.js';

/**
 * In-memory stand-ins for the Kubernetes API, compute_ctl and the storage
 * controller. They record calls so tests can assert what the control plane did,
 * and they run on a fake clock so waiting costs nothing.
 */

export function newTestSigner(): Ed25519Signer {
  return createEd25519Signer(generateKeyPairSync('ed25519').privateKey);
}

export interface FakeClock {
  now(): Date;
  sleep(ms: number): Promise<void>;
  /** Total fake time slept, for asserting backoff. */
  elapsedMs(): number;
}

/** Sleeping advances the fake time and yields once, so concurrent tasks interleave. */
export function createFakeClock(
  start = new Date('2026-01-01T00:00:00Z'),
): FakeClock {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    async sleep(ms) {
      current += ms;
      await new Promise((resolve) => setImmediate(resolve));
    },
    elapsedMs: () => current - start.getTime(),
  };
}

export interface FakePods extends PodApi {
  pods: Map<string, V1Pod>;
  created: string[];
  deleted: string[];
  /** Number of `get` calls that see the pod Pending (no IP) before it runs. */
  pendingPolls: number;
  /** Phase new pods end in. `Failed` simulates a crash on start. */
  finalPhase: 'Running' | 'Failed';
  /** Pod names whose deletion lingers for this many `get` calls. */
  terminatingFor: Map<string, number>;
  nextIp: string;
}

export function createFakePods(): FakePods {
  const pods = new Map<string, V1Pod>();
  const polls = new Map<string, number>();
  const fake: FakePods = {
    pods,
    created: [],
    deleted: [],
    pendingPolls: 1,
    finalPhase: 'Running',
    terminatingFor: new Map(),
    nextIp: '10.42.0.10',
    async create(pod) {
      const name = pod.metadata?.name as string;
      if (pods.has(name)) throw new PodAlreadyExistsError(name);
      pods.set(name, structuredClone(pod));
      polls.set(name, 0);
      fake.created.push(name);
      return pod;
    },
    async get(name) {
      const pod = pods.get(name);
      if (!pod) return null;
      const lingering = fake.terminatingFor.get(name) ?? 0;
      if (lingering > 0) {
        fake.terminatingFor.set(name, lingering - 1);
        if (lingering - 1 === 0) pods.delete(name);
        return pod;
      }
      const seen = (polls.get(name) ?? 0) + 1;
      polls.set(name, seen);
      if (seen > fake.pendingPolls && !pod.status) {
        pod.status =
          fake.finalPhase === 'Running'
            ? { phase: 'Running', podIP: fake.nextIp }
            : { phase: 'Failed', reason: 'Error' };
      } else if (!pod.status) {
        return { ...pod, status: { phase: 'Pending' } };
      }
      return structuredClone(pod);
    },
    async delete(name) {
      fake.deleted.push(name);
      if ((fake.terminatingFor.get(name) ?? 0) > 0) return;
      pods.delete(name);
    },
  };
  return fake;
}

export interface FakeComputeCtl extends ComputeCtlClient {
  /** Status reported per pod IP; defaults to `running`. */
  statuses: Map<string, ComputeCtlStatusReport>;
  /** Polls that fail as unreachable before a pod answers. */
  unreachablePolls: number;
  configured: {
    podIp: string;
    computeId: string;
    config: ComputeConfigResponse;
  }[];
  terminated: string[];
  failTerminate: boolean;
  failConfigure: boolean;
}

export function createFakeComputeCtl(): FakeComputeCtl {
  let polls = 0;
  const fake: FakeComputeCtl = {
    statuses: new Map(),
    unreachablePolls: 0,
    configured: [],
    terminated: [],
    failTerminate: false,
    failConfigure: false,
    async status(podIp) {
      polls += 1;
      if (polls <= fake.unreachablePolls) {
        throw new ComputeCtlError('unreachable', null);
      }
      return (
        fake.statuses.get(podIp) ?? {
          status: 'running' as ComputeCtlStatus,
          lastActive: null,
          error: null,
        }
      );
    },
    async configure(podIp, computeId, config) {
      if (fake.failConfigure)
        throw new ComputeCtlError('configure failed', 500);
      fake.configured.push({ podIp, computeId, config });
    },
    async terminate(podIp) {
      if (fake.failTerminate) throw new ComputeCtlError('unreachable', null);
      fake.terminated.push(podIp);
    },
  };
  return fake;
}

export interface FakeStorcon extends StorconClient {
  calls: string[];
  locate: LocateResponse | Error;
  /** Responses for createTimeline, in order; the last one repeats. */
  timelineSafekeepers: {
    generation: number;
    safekeepers: { id: number; hostname: string }[];
  } | null;
  failNext: Map<string, Error>;
}

export function createFakeStorcon(): FakeStorcon {
  const fake: FakeStorcon = {
    calls: [],
    locate: {
      shards: [
        {
          shard_id: '0'.repeat(32),
          node_id: 1,
          listen_pg_addr: '100.64.0.1',
          listen_pg_port: 6400,
        },
      ],
      shard_params: { count: 0, stripe_size: 2048 },
    },
    timelineSafekeepers: {
      generation: 1,
      safekeepers: [
        { id: 1, hostname: 'safekeeper-0.safekeeper.neon.svc.cluster.local' },
        { id: 2, hostname: 'safekeeper-1.safekeeper.neon.svc.cluster.local' },
        { id: 3, hostname: 'safekeeper-2.safekeeper.neon.svc.cluster.local' },
      ],
    },
    failNext: new Map(),
    async createTenant(input) {
      fake.calls.push(
        `createTenant ${input.tenantId} ${input.historyRetentionSeconds}`,
      );
      throwIfScripted('createTenant');
    },
    async createTimeline(tenantId, input) {
      fake.calls.push(
        input.kind === 'root'
          ? `createTimeline ${tenantId} root ${input.timelineId}`
          : `createTimeline ${tenantId} branch ${input.timelineId} from ${input.ancestorTimelineId} @ ${input.ancestorStartLsn ?? 'latest'}`,
      );
      throwIfScripted('createTimeline');
      return {
        timeline_id: input.timelineId,
        ancestor_lsn:
          input.kind === 'branch'
            ? (input.ancestorStartLsn ?? '0/1000000')
            : null,
        safekeepers: fake.timelineSafekeepers,
      };
    },
    async deleteTimeline(tenantId, timelineId) {
      fake.calls.push(`deleteTimeline ${tenantId} ${timelineId}`);
      throwIfScripted('deleteTimeline');
    },
    async deleteTenant(tenantId) {
      fake.calls.push(`deleteTenant ${tenantId}`);
      throwIfScripted('deleteTenant');
    },
    async locateTenant(tenantId) {
      fake.calls.push(`locateTenant ${tenantId}`);
      if (fake.locate instanceof Error) throw fake.locate;
      return fake.locate;
    },
    async listNodes() {
      fake.calls.push('listNodes');
      return [];
    },
    async listSafekeepers() {
      fake.calls.push('listSafekeepers');
      return [];
    },
    async upsertSafekeeper(safekeeper) {
      fake.calls.push(`upsertSafekeeper ${safekeeper.id} ${safekeeper.host}`);
    },
    async setSafekeeperSchedulingPolicy(id, policy) {
      fake.calls.push(`setPolicy ${id} ${policy}`);
    },
  };
  function throwIfScripted(method: string) {
    const error = fake.failNext.get(method);
    if (error) {
      fake.failNext.delete(method);
      throw error;
    }
  }
  return fake;
}

export interface SeededProject {
  store: MemoryNeonStore;
  scope: Scope;
  projectId: string;
  tenantId: string;
  branchId: string;
  timelineId: string;
  endpointId: string;
}

/** A store holding one finished project: default branch with safekeepers, one idle endpoint, one role and database. */
export async function seedProject(
  store: MemoryNeonStore = createMemoryNeonStore(),
  overrides: { consoleProjectId?: string; orgId?: string } = {},
): Promise<SeededProject> {
  const scope: Scope = {
    orgId: overrides.orgId ?? 'org_1',
    consoleProjectId: overrides.consoleProjectId ?? 'cp_1',
  };
  const projectId = newId('proj');
  const branchId = newId('br');
  const tenantId = newNeonId();
  const timelineId = newNeonId();
  const endpointId = newEndpointId();
  const operation = await store.commit(
    scope,
    { action: 'project.create', targetType: 'project', targetId: projectId },
    [
      {
        kind: 'project.insert',
        row: {
          id: projectId,
          consoleProjectId: scope.consoleProjectId,
          consoleOrgId: scope.orgId,
          name: 'demo',
          tenantId,
        },
      },
      {
        kind: 'branch.insert',
        row: {
          id: branchId,
          projectId,
          name: 'main',
          timelineId,
          isDefault: true,
          safekeepers: {
            generation: 1,
            safekeepers: [
              {
                id: 1,
                hostname: 'safekeeper-0.safekeeper.neon.svc.cluster.local',
              },
              {
                id: 2,
                hostname: 'safekeeper-1.safekeeper.neon.svc.cluster.local',
              },
              {
                id: 3,
                hostname: 'safekeeper-2.safekeeper.neon.svc.cluster.local',
              },
            ],
          },
        },
      },
      { kind: 'endpoint.insert', row: { id: endpointId, branchId } },
      {
        kind: 'role.insert',
        row: {
          id: newId('role'),
          branchId,
          name: 'neondb_owner',
          scramSecret: 'SCRAM-SHA-256$4096:c2FsdA==$c3RvcmVk:c2VydmVy',
        },
      },
      {
        kind: 'database.insert',
        row: {
          id: newId('db'),
          branchId,
          name: 'neondb',
          ownerRole: 'neondb_owner',
        },
      },
    ],
  );
  const record = store.operations.get(operation.id);
  if (record) record.status = 'finished';
  return {
    store,
    scope,
    projectId,
    tenantId,
    branchId,
    timelineId,
    endpointId,
  };
}
