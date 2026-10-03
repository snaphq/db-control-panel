import { z } from 'zod';
import {
  type StorconClientOptions,
  createStorconTransport,
} from './storcon-http.js';

/**
 * Typed client for the Neon storage controller (storage_controller/src/http.rs).
 * Every call carries the admin-scoped token, which `check_permissions` accepts
 * for every route used here (http.rs:1811-1821: the required scope, or `admin`).
 */

export { StorconError, type StorconClientOptions } from './storcon-http.js';

/** Deletes wait inside the controller for up to 25 s (http.rs:502). */
const DELETE_TIMEOUT_MS = 60_000;

// ---- wire types -----------------------------------------------------------------

const lsn = z.string();

/** `TenantLocateResponse` (libs/pageserver_api/src/controller_api.rs:106-124). */
const locateResponseSchema = z.object({
  shards: z
    .array(
      z.object({
        /** `TenantShardId`: 32 hex, or `<32 hex>-<2 hex shard><2 hex count>`. */
        shard_id: z.string(),
        node_id: z.number().int(),
        listen_pg_addr: z.string(),
        listen_pg_port: z.number().int(),
        listen_grpc_addr: z.string().nullable().optional(),
        listen_grpc_port: z.number().int().nullable().optional(),
      }),
    )
    .min(1),
  /** `ShardParameters`: `count` is 0 for an unsharded tenant. */
  shard_params: z.object({
    count: z.number().int().min(0),
    stripe_size: z.number().int().positive(),
  }),
});
export type LocateResponse = z.infer<typeof locateResponseSchema>;

/** `TimelineCreateResponseStorcon` (libs/pageserver_api/src/models.rs:370-385). */
const timelineCreateResponseSchema = z.object({
  timeline_id: z.string(),
  ancestor_timeline_id: z.string().nullable().optional(),
  ancestor_lsn: lsn.nullable().optional(),
  last_record_lsn: lsn.optional(),
  safekeepers: z
    .object({
      generation: z.number().int().nonnegative(),
      safekeepers: z.array(
        z.object({ id: z.number().int(), hostname: z.string() }),
      ),
    })
    .nullable()
    .optional(),
});
type TimelineCreateResponse = z.infer<typeof timelineCreateResponseSchema>;

/**
 * The `get_lsn_by_timestamp` answer: `Result` in pageserver/src/http/routes.rs:1069-1076,
 * its `kind` strings from `LsnForTimestamp` (routes.rs:1078-1083; the enum is
 * pageserver/src/pgdatadir_mapping.rs:66-95). The lease fields are flattened
 * in when `with_lease=true` (routes.rs:1085-1095).
 */
const lsnByTimestampSchema = z.object({
  /** `hi/lo` hexadecimal, like every serialized `Lsn` (libs/utils/src/lsn.rs:20-31). */
  lsn: z.string().regex(/^[0-9A-Fa-f]{1,8}\/[0-9A-Fa-f]{1,8}$/),
  kind: z.enum(['present', 'future', 'past', 'nodata']),
  /** RFC 3339 end of the LSN lease, present when one was granted. */
  valid_until: z.string().optional(),
});
export type LsnByTimestamp = z.infer<typeof lsnByTimestampSchema>;

/** `NodeDescribeResponse` (controller_api.rs:158-174). */
const nodeSchema = z.object({
  id: z.number().int(),
  availability: z.string(),
  scheduling: z.string(),
  availability_zone_id: z.string(),
  listen_pg_addr: z.string(),
  listen_pg_port: z.number().int(),
  listen_http_addr: z.string(),
  listen_http_port: z.number().int(),
});
export type StorconNode = z.infer<typeof nodeSchema>;

/** `SkSchedulingPolicy` serializes as its variant name (controller_api.rs:436-442). */
const SK_POLICIES = ['Active', 'Activating', 'Pause', 'Decomissioned'] as const;
type SafekeeperSchedulingPolicy = (typeof SK_POLICIES)[number];

/** `SafekeeperDescribeResponse` (controller_api.rs:539-552). */
const safekeeperSchema = z.object({
  id: z.number().int(),
  host: z.string(),
  port: z.number().int(),
  http_port: z.number().int(),
  availability_zone_id: z.string(),
  scheduling_policy: z.enum(SK_POLICIES),
});
export type StorconSafekeeper = z.infer<typeof safekeeperSchema>;

/** `SafekeeperUpsert` (storage_controller/src/persistence.rs:2519-2533). */
interface SafekeeperUpsert {
  id: number;
  region_id: string;
  /** 1 means "just created, not yet posted to the controller". */
  version: number;
  host: string;
  port: number;
  http_port: number;
  availability_zone_id: string;
}

interface CreateTenantInput {
  tenantId: string;
  /** History retention, sent as the tenant's `pitr_interval`. */
  historyRetentionSeconds: number;
}

type CreateTimelineInput =
  | { kind: 'root'; timelineId: string; pgVersion: number }
  | {
      kind: 'branch';
      timelineId: string;
      ancestorTimelineId: string;
      /** Defaults to the ancestor's latest LSN when omitted. */
      ancestorStartLsn?: string;
    };

export interface StorconClient {
  createTenant(input: CreateTenantInput): Promise<void>;
  createTimeline(
    tenantId: string,
    input: CreateTimelineInput,
  ): Promise<TimelineCreateResponse>;
  /**
   * Maps a wall-clock time to an LSN of the timeline and takes a short LSN
   * lease on it, so garbage collection cannot overtake the LSN before a branch
   * is created from it. See {@link LsnByTimestamp} for the `kind` values.
   */
  getLsnByTimestamp(
    tenantId: string,
    timelineId: string,
    timestamp: Date,
  ): Promise<LsnByTimestamp>;
  /** Idempotent: a timeline that is already gone counts as deleted. */
  deleteTimeline(tenantId: string, timelineId: string): Promise<void>;
  /** Idempotent: a tenant that is already gone counts as deleted. */
  deleteTenant(tenantId: string): Promise<void>;
  locateTenant(tenantId: string): Promise<LocateResponse>;
  listNodes(): Promise<StorconNode[]>;
  listSafekeepers(): Promise<StorconSafekeeper[]>;
  upsertSafekeeper(safekeeper: SafekeeperUpsert): Promise<void>;
  setSafekeeperSchedulingPolicy(
    id: number,
    policy: SafekeeperSchedulingPolicy,
  ): Promise<void>;
}

// ---- implementation ---------------------------------------------------------------

export function createStorconClient(
  options: StorconClientOptions,
): StorconClient {
  const { call, callJson } = createStorconTransport(options);

  return {
    async createTenant(input) {
      // TenantCreateRequest (controller_api.rs:17-36): `new_tenant_id` is a
      // TenantShardId, written as the bare 32-hex id when unsharded. Shard
      // parameters and placement policy are left out so the controller creates
      // one unsharded shard with `Attached(0)` (service.rs:2635-2639). The
      // config is flattened into the body; `pitr_interval` is a humantime
      // string (models.rs:711-713). Re-sending the same request is a no-op
      // (service.rs:2723-2733).
      await call({
        method: 'POST',
        path: '/v1/tenant',
        body: {
          new_tenant_id: input.tenantId,
          pitr_interval: `${input.historyRetentionSeconds}s`,
        },
        ok: [200, 201],
      });
    },

    async createTimeline(tenantId, input) {
      // TimelineCreateRequest (models.rs:313-318) flattens an untagged mode
      // enum; `pg_version` is the major version number (PgMajorVersion is
      // serialized with serde_repr), `ancestor_start_lsn` an `hi/lo` string.
      const body =
        input.kind === 'root'
          ? { new_timeline_id: input.timelineId, pg_version: input.pgVersion }
          : {
              new_timeline_id: input.timelineId,
              ancestor_timeline_id: input.ancestorTimelineId,
              ...(input.ancestorStartLsn
                ? { ancestor_start_lsn: input.ancestorStartLsn }
                : {}),
            };
      return callJson(
        {
          method: 'POST',
          path: `/v1/tenant/${tenantId}/timeline`,
          body,
          ok: [200, 201],
        },
        timelineCreateResponseSchema,
      );
    },

    async getLsnByTimestamp(tenantId, timelineId, timestamp) {
      // Not handled by the controller itself: `GET /v1/tenant/:tenant_id/*` is a
      // passthrough to the pageserver that holds shard zero (http.rs:2672-2681,
      // handler at 723-856), which needs the PageServerApi scope or admin
      // (http.rs:728, 1811-1821). The pageserver route is
      // `.../timeline/:timeline_id/get_lsn_by_timestamp` (routes.rs:4094). It
      // parses `timestamp` with humantime::parse_rfc3339, which takes UTC only
      // (`Z` or `+00:00`; routes.rs:1052-1056), hence `toISOString()`.
      const query = new URLSearchParams({
        timestamp: timestamp.toISOString(),
        with_lease: 'true',
      });
      return callJson(
        {
          method: 'GET',
          path: `/v1/tenant/${tenantId}/timeline/${timelineId}/get_lsn_by_timestamp?${query}`,
          ok: [200],
        },
        lsnByTimestampSchema,
      );
    },

    async deleteTimeline(tenantId, timelineId) {
      // The controller loops until the pageserver answers 404 and then returns
      // 200; 409 means it gave up waiting and the caller should ask again
      // (http.rs:502-536).
      await call({
        method: 'DELETE',
        path: `/v1/tenant/${tenantId}/timeline/${timelineId}`,
        ok: [200],
        done: [404],
        retryOn: [202, 409],
        timeoutMs: DELETE_TIMEOUT_MS,
      });
    },

    async deleteTenant(tenantId) {
      await call({
        method: 'DELETE',
        path: `/v1/tenant/${tenantId}`,
        ok: [200],
        done: [404],
        retryOn: [202, 409],
        timeoutMs: DELETE_TIMEOUT_MS,
      });
    },

    async locateTenant(tenantId) {
      // Admin scope only (http.rs:858-872). 400 means the tenant has a shard
      // that is not attached yet (service.rs:5477-5483); the caller decides
      // whether to wait, so it is surfaced rather than retried.
      return callJson(
        {
          method: 'GET',
          path: `/debug/v1/tenant/${tenantId}/locate`,
          ok: [200],
        },
        locateResponseSchema,
      );
    },

    async listNodes() {
      return callJson(
        { method: 'GET', path: '/control/v1/node', ok: [200] },
        z.array(nodeSchema),
      );
    },

    async listSafekeepers() {
      return callJson(
        { method: 'GET', path: '/control/v1/safekeeper', ok: [200] },
        z.array(safekeeperSchema),
      );
    },

    async upsertSafekeeper(safekeeper) {
      // The id is in both the path and the body and the two must agree
      // (http.rs:1718-1724). Answers 204.
      await call({
        method: 'POST',
        path: `/control/v1/safekeeper/${safekeeper.id}`,
        body: safekeeper,
        ok: [200, 204],
      });
    },

    async setSafekeeperSchedulingPolicy(id, policy) {
      await call({
        method: 'POST',
        path: `/control/v1/safekeeper/${id}/scheduling_policy`,
        body: { scheduling_policy: policy },
        ok: [200],
      });
    },
  };
}
