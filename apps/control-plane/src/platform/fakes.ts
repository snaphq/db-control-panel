import { createFakeClock, createFakeStorcon } from '../neon/fakes.js';
import type {
  StorconAdminClient,
  StorconTenant,
} from '../neon/storcon-admin.js';
import type {
  StorconClient,
  StorconSafekeeper,
} from '../neon/storcon-client.js';
import { StorconError } from '../neon/storcon-http.js';
import { createMemoryNeonStore } from '../neon/store-memory.js';
import type { PlatformConfig, PlatformDeps } from './deps.js';
import type { SafekeeperApi } from './safekeeper-client.js';
import type {
  SafekeeperKube,
  SafekeeperKubeStatus,
} from './safekeeper-kube.js';
import {
  type SafekeeperWorkload,
  safekeeperSpecHash,
} from './safekeeper-manifests.js';
import { createMemoryPlatformStore } from './store-memory.js';

/**
 * In-memory stand-ins for what the platform operations talk to: Kubernetes
 * (StatefulSets), the storage controller (safekeepers, timeline membership,
 * tenant placement) and the safekeepers' own APIs. One model backs the
 * controller and the safekeeper listing, so a migration visibly moves a
 * timeline between safekeepers.
 */

const GB = 1024 ** 3;

export interface FakeSafekeeperKube extends SafekeeperKube {
  calls: string[];
  objects: Map<
    number,
    { workload: SafekeeperWorkload; hash: string; ready: boolean }
  >;
  /** A new StatefulSet's pod is Ready at once. */
  autoReady: boolean;
}

function createFakeSafekeeperKube(): FakeSafekeeperKube {
  const fake: FakeSafekeeperKube = {
    calls: [],
    objects: new Map(),
    autoReady: true,
    async ensure(input) {
      fake.calls.push(`ensure ${input.id}@${input.nodeName}`);
      if (!fake.objects.has(input.id)) {
        fake.objects.set(input.id, {
          workload: input,
          hash: safekeeperSpecHash(input),
          ready: fake.autoReady,
        });
      }
    },
    async status(input): Promise<SafekeeperKubeStatus> {
      const found = fake.objects.get(input.id);
      return {
        exists: found !== undefined,
        ready: found?.ready ?? false,
        current: found?.hash === safekeeperSpecHash(input),
      };
    },
    async update(input) {
      fake.calls.push(`update ${input.id}`);
      const found = fake.objects.get(input.id);
      if (!found) throw new Error(`no StatefulSet for safekeeper ${input.id}`);
      found.workload = input;
      found.hash = safekeeperSpecHash(input);
    },
    async remove(id) {
      fake.calls.push(`remove ${id}`);
      fake.objects.delete(id);
    },
  };
  return fake;
}

interface FakeTimeline {
  skSet: number[];
  newSkSet: number[] | null;
  generation: number;
}

export interface FakeShard {
  shardId: string;
  tenantId: string;
  nodeAttached: number | null;
  preferredAz: string | null;
  /** Makes the controller report the shard as reconciling. */
  reconciling: boolean;
  schedulingPolicy: string;
}

export interface FakeController {
  /** Every call, in order, as `<method> <args>`. */
  calls: string[];
  safekeepers: Map<number, StorconSafekeeper>;
  /** Timelines by `<tenant>/<timeline>`. */
  timelines: Map<string, FakeTimeline>;
  /**
   * Timelines a safekeeper still lists after it was dropped from their set, to
   * simulate a slow exclusion; they clear after `lingerPolls` listings.
   */
  lingering: Map<number, Set<string>>;
  /** Listings a dropped safekeeper keeps showing its old timelines for; 0 disables. */
  lingerPolls: number;
  lingerLeft: Map<number, number>;
  /** Timelines on a safekeeper that the controller does not manage. */
  orphans: Map<number, string[]>;
  /** Scripted failures: `<method>:<key>` to a list of errors thrown in turn. */
  failures: Map<string, Error[]>;
  /** Pageserver nodes the controller knows. */
  pageservers: {
    id: number;
    az: string;
    availability: string;
    scheduling: string;
  }[];
  shards: FakeShard[];
  /** Polls before a migrated shard shows as attached on its new node. */
  settlePolls: number;
}

function key(tenantId: string, timelineId: string) {
  return `${tenantId}/${timelineId}`;
}

export interface PlatformHarness {
  deps: PlatformDeps;
  neon: ReturnType<typeof createMemoryNeonStore>;
  platform: ReturnType<typeof createMemoryPlatformStore>;
  kube: FakeSafekeeperKube;
  controller: FakeController;
  storcon: StorconClient;
  admin: StorconAdminClient;
  safekeeperApi: SafekeeperApi;
  clock: ReturnType<typeof createFakeClock>;
  logs: string[];
  /** Adds a node the way the node sync records it. */
  addNode(
    id: number,
    options?: { roles?: string[]; ready?: boolean; storageGb?: number },
  ): Promise<void>;
  /** Adds a timeline whose set is `skSet`, and returns its key parts. */
  addTimeline(skSet: number[]): { tenantId: string; timelineId: string };
  /** Adds an Active pageserver to the controller (and its node row). */
  addPageserver(id: number, options?: { availability?: string }): Promise<void>;
  /** Attaches `count` new single-shard tenants to a pageserver. */
  addShards(
    nodeId: number,
    count: number,
    options?: Partial<
      Pick<FakeShard, 'preferredAz' | 'reconciling' | 'schedulingPolicy'>
    >,
  ): FakeShard[];
}

const CONFIG: PlatformConfig = {
  safekeeperCount: 3,
  neonImage: 'ghcr.io/snaphq/neon:one',
  pullSecret: 'ghcr-pull',
  entrypointConfigMap: 'safekeeper-entrypoint',
  safekeeperStorage: '50Gi',
  migrateConcurrency: 2,
  rebalanceMaxMoves: 8,
  rebalancePrewarm: true,
  settleTimeoutMs: 120_000,
  waitTimeoutMs: 60_000,
  pollIntervalMs: 1_000,
};

export function createPlatformHarness(
  overrides: Partial<PlatformConfig> = {},
): PlatformHarness {
  const neon = createMemoryNeonStore();
  const platform = createMemoryPlatformStore(neon.operations);
  const kube = createFakeSafekeeperKube();
  const clock = createFakeClock();
  const logs: string[] = [];
  let timelineCounter = 0;
  let shardCounter = 0;

  const controller: FakeController = {
    calls: [],
    safekeepers: new Map(),
    timelines: new Map(),
    lingering: new Map(),
    lingerPolls: 0,
    lingerLeft: new Map(),
    orphans: new Map(),
    failures: new Map(),
    pageservers: [],
    shards: [],
    settlePolls: 1,
  };
  const scripted = (id: string) => {
    const error = controller.failures.get(id)?.shift();
    if (error) throw error;
  };

  const storcon: StorconClient = {
    ...createFakeStorcon(),
    async listSafekeepers() {
      return [...controller.safekeepers.values()].sort((a, b) => a.id - b.id);
    },
    async upsertSafekeeper(sk) {
      controller.calls.push(`upsertSafekeeper ${sk.id}`);
      const existing = controller.safekeepers.get(sk.id);
      controller.safekeepers.set(sk.id, {
        id: sk.id,
        host: sk.host,
        port: sk.port,
        http_port: sk.http_port,
        availability_zone_id: sk.availability_zone_id,
        scheduling_policy: existing?.scheduling_policy ?? 'Activating',
      });
    },
    async setSafekeeperSchedulingPolicy(id, policy) {
      controller.calls.push(`setPolicy ${id} ${policy}`);
      const found = controller.safekeepers.get(id);
      if (!found)
        throw new StorconError('no such safekeeper', 'POST', '/', 404);
      found.scheduling_policy = policy;
    },
    async listNodes() {
      return controller.pageservers.map((p) => ({
        id: p.id,
        availability: p.availability,
        scheduling: p.scheduling,
        availability_zone_id: p.az,
        listen_pg_addr: `100.64.0.${p.id}`,
        listen_pg_port: 6400,
        listen_http_addr: `100.64.0.${p.id}`,
        listen_http_port: 9898,
      }));
    },
  };

  const tenantOf = (tenantId: string): StorconTenant | null => {
    const shards = controller.shards.filter((s) => s.tenantId === tenantId);
    if (shards.length === 0) return null;
    return {
      tenant_id: tenantId,
      shards: shards.map((s) => ({
        tenant_shard_id: s.shardId,
        node_attached: s.nodeAttached,
        node_secondary: [],
        is_reconciling: s.reconciling,
        is_pending_compute_notification: false,
        is_splitting: false,
        is_importing: false,
        scheduling_policy: s.schedulingPolicy,
        preferred_az_id: s.preferredAz,
      })),
    };
  };
  const pendingMoves = new Map<string, { to: number; polls: number }>();

  const admin: StorconAdminClient = {
    async listTenants() {
      controller.calls.push('listTenants');
      scripted('listTenants');
      const ids = [...new Set(controller.shards.map((s) => s.tenantId))];
      return ids.map((id) => tenantOf(id) as StorconTenant);
    },
    async describeTenant(tenantId) {
      controller.calls.push(`describeTenant ${tenantId}`);
      for (const shard of controller.shards.filter(
        (s) => s.tenantId === tenantId,
      )) {
        const move = pendingMoves.get(shard.shardId);
        if (move) {
          move.polls -= 1;
          if (move.polls <= 0) {
            shard.nodeAttached = move.to;
            shard.reconciling = false;
            pendingMoves.delete(shard.shardId);
          }
        }
      }
      return tenantOf(tenantId);
    },
    async migrateShard(input) {
      controller.calls.push(
        `migrateShard ${input.shardId} ${input.originNodeId}->${input.nodeId} prewarm=${input.prewarm}`,
      );
      scripted(`migrateShard:${input.shardId}`);
      const shard = controller.shards.find((s) => s.shardId === input.shardId);
      if (!shard)
        throw new StorconError('Tenant shard not found', 'PUT', '/', 404);
      if (shard.nodeAttached !== input.originNodeId) {
        throw new StorconError(
          'Migration expected to originate elsewhere',
          'PUT',
          '/',
          412,
        );
      }
      if (input.nodeId === input.originNodeId) {
        pendingMoves.delete(shard.shardId); // cancels a graceful move
        return 'done';
      }
      shard.reconciling = true;
      pendingMoves.set(shard.shardId, {
        to: input.nodeId,
        polls: controller.settlePolls,
      });
      return 'done';
    },
    async setPreferredAzs(azs) {
      controller.calls.push(`setPreferredAzs ${JSON.stringify(azs)}`);
      for (const [shardId, az] of Object.entries(azs)) {
        const shard = controller.shards.find((s) => s.shardId === shardId);
        if (shard) shard.preferredAz = az;
      }
      return Object.keys(azs);
    },
    async locateTimeline(tenantId, timelineId) {
      const found = controller.timelines.get(key(tenantId, timelineId));
      if (!found) return null;
      return {
        generation: found.generation,
        sk_set: [...found.skSet],
        new_sk_set: found.newSkSet ? [...found.newSkSet] : null,
      };
    },
    async migrateTimeline(tenantId, timelineId, newSkSet) {
      const id = key(tenantId, timelineId);
      controller.calls.push(`migrateTimeline ${id} [${newSkSet}]`);
      scripted(`migrateTimeline:${id}`);
      const found = controller.timelines.get(id);
      if (!found)
        throw new StorconError('timeline not found', 'POST', '/', 404);
      if (found.newSkSet && found.newSkSet.join() !== newSkSet.join()) {
        throw new StorconError(
          'already migrating to a different set',
          'POST',
          '/',
          409,
        );
      }
      const dropped = found.skSet.filter((sk) => !newSkSet.includes(sk));
      found.skSet = [...newSkSet];
      found.newSkSet = null;
      found.generation += 2;
      if (controller.lingerPolls > 0) {
        for (const sk of dropped) {
          controller.lingering.set(
            sk,
            (controller.lingering.get(sk) ?? new Set()).add(id),
          );
          controller.lingerLeft.set(sk, controller.lingerPolls);
        }
      }
    },
    async abortTimelineMigration(tenantId, timelineId) {
      const id = key(tenantId, timelineId);
      controller.calls.push(`abortMigration ${id}`);
      const found = controller.timelines.get(id);
      if (found) found.newSkSet = null;
    },
  };

  const safekeeperApi: SafekeeperApi = {
    async listTimelines(id) {
      controller.calls.push(`listTimelines ${id}`);
      scripted(`listTimelines:${id}`);
      const here = [...controller.timelines.entries()]
        .filter(
          ([k, t]) =>
            t.skSet.includes(id) || controller.lingering.get(id)?.has(k),
        )
        .map(([k]) => k);
      const left = (controller.lingerLeft.get(id) ?? 0) - 1;
      controller.lingerLeft.set(id, left);
      if (left <= 0) controller.lingering.delete(id);
      return [...new Set([...here, ...(controller.orphans.get(id) ?? [])])].map(
        (k) => {
          const [tenantId, timelineId] = k.split('/') as [string, string];
          return { tenantId, timelineId };
        },
      );
    },
  };

  const deps: PlatformDeps = {
    platform,
    neon,
    storcon,
    admin,
    kube,
    safekeepers: safekeeperApi,
    config: { ...CONFIG, ...overrides },
    now: () => clock.now().getTime(),
    sleep: (ms) => clock.sleep(ms),
    logger: {
      info: (m) => logs.push(`info: ${m}`),
      warn: (m) => logs.push(`warn: ${m}`),
    },
  };

  return {
    deps,
    neon,
    platform,
    kube,
    controller,
    storcon,
    admin,
    safekeeperApi,
    clock,
    logs,
    async addNode(id, options = {}) {
      await neon.upsertNode({
        id,
        name: `node-${id}`,
        tailscaleIp: `100.64.0.${id}`,
        zone: `az-${id}`,
        addRoles: [],
        roles: options.roles ?? ['pageserver', 'compute'],
        capacity: {
          ready: options.ready ?? true,
          missing: false,
          hostname: `host-${id}`,
          allocatable: { storageBytes: (options.storageGb ?? 500) * GB },
        },
      });
    },
    async addPageserver(id, options = {}) {
      await this.addNode(id);
      controller.pageservers.push({
        id,
        az: `az-${id}`,
        availability: options.availability ?? 'Active',
        scheduling: 'Active',
      });
    },
    addShards(nodeId, count, options = {}) {
      const added: FakeShard[] = [];
      for (let i = 0; i < count; i++) {
        shardCounter += 1;
        const id = shardCounter.toString(16).padStart(32, 'c');
        const shard: FakeShard = {
          shardId: id,
          tenantId: id,
          nodeAttached: nodeId,
          preferredAz: `az-${nodeId}`,
          reconciling: false,
          schedulingPolicy: 'Active',
          ...options,
        };
        controller.shards.push(shard);
        added.push(shard);
      }
      return added;
    },
    addTimeline(skSet) {
      timelineCounter += 1;
      const tenantId = timelineCounter.toString(16).padStart(32, 'a');
      const timelineId = timelineCounter.toString(16).padStart(32, 'b');
      controller.timelines.set(key(tenantId, timelineId), {
        skSet: [...skSet],
        newSkSet: null,
        generation: 1,
      });
      return { tenantId, timelineId };
    },
  };
}
