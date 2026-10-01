import { z } from 'zod';

/**
 * Typed client for the Neon storage controller (storage_controller/src/http.rs).
 * Every call carries the admin-scoped token, which `check_permissions` accepts
 * for every route used here (http.rs:1811: the required scope, or `admin`).
 */

export class StorconError extends Error {
  constructor(
    message: string,
    readonly method: string,
    readonly path: string,
    /** HTTP status, or null when the request never got a response. */
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'StorconError';
  }
}

interface RetryOptions {
  /** Total tries, including the first. */
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface StorconClientOptions {
  baseUrl: string;
  /** Admin-scoped Neon token (`CONTROL_PLANE_JWT_TOKEN`). */
  token: string;
  fetch?: typeof fetch;
  retry?: Partial<RetryOptions>;
  requestTimeoutMs?: number;
  /** Test hook: replaces the backoff sleep. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_RETRY: RetryOptions = {
  attempts: 5,
  baseDelayMs: 250,
  maxDelayMs: 5_000,
};
const DEFAULT_TIMEOUT_MS = 30_000;
/** Deletes wait inside the controller for up to 25 s (http.rs:502). */
const DELETE_TIMEOUT_MS = 60_000;

/** Statuses worth another try: the controller is starting, busy or behind a proxy. */
const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([429, 502, 503, 504]);

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
type StorconSafekeeper = z.infer<typeof safekeeperSchema>;

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

interface RequestSpec {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  body?: unknown;
  /** Statuses that mean success. */
  ok: readonly number[];
  /** Statuses that also mean "done" and are not an error (e.g. 404 on delete). */
  done?: readonly number[];
  /** Extra statuses to retry (deletes answer 202/409 while still in progress). */
  retryOn?: readonly number[];
  timeoutMs?: number;
}

/** The controller reports errors as `{"msg": "..."}` (libs/utils HttpErrorBody). */
function errorDetail(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 'msg' in parsed) {
      return String((parsed as { msg: unknown }).msg);
    }
  } catch {
    // not JSON; fall through to the raw text
  }
  return text.slice(0, 500);
}

export function createStorconClient(
  options: StorconClientOptions,
): StorconClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const doFetch = options.fetch ?? fetch;
  const retry: RetryOptions = { ...DEFAULT_RETRY, ...options.retry };
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  const backoff = (attempt: number, retryAfterSeconds: number | null) => {
    const exponential = Math.min(
      retry.maxDelayMs,
      retry.baseDelayMs * 2 ** (attempt - 1),
    );
    if (retryAfterSeconds !== null) {
      return Math.min(retry.maxDelayMs, retryAfterSeconds * 1000);
    }
    return Math.round(exponential / 2 + Math.random() * (exponential / 2));
  };

  /** Runs one request with retries; resolves to the final response status and text. */
  async function send(
    spec: RequestSpec,
  ): Promise<{ status: number; text: string }> {
    const url = `${baseUrl}${spec.path}`;
    let lastFailure = '';
    let lastStatus: number | null = null;
    for (let attempt = 1; attempt <= retry.attempts; attempt++) {
      let retryAfter: number | null = null;
      try {
        const response = await doFetch(url, {
          method: spec.method,
          headers: {
            authorization: `Bearer ${options.token}`,
            ...(spec.body === undefined
              ? {}
              : { 'content-type': 'application/json' }),
          },
          body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
          signal: AbortSignal.timeout(spec.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });
        const text = await response.text();
        const retryable =
          TRANSIENT_STATUSES.has(response.status) ||
          (spec.retryOn?.includes(response.status) ?? false);
        if (!retryable) return { status: response.status, text };
        lastStatus = response.status;
        lastFailure = `${response.status} ${errorDetail(text)}`;
        const header = Number(response.headers.get('retry-after'));
        retryAfter = Number.isFinite(header) && header > 0 ? header : null;
      } catch (error) {
        // Connection refused while the controller restarts, or a timeout.
        lastStatus = null;
        lastFailure = (error as Error).message;
      }
      if (attempt < retry.attempts) await sleep(backoff(attempt, retryAfter));
    }
    throw new StorconError(
      `Storage controller ${spec.method} ${spec.path} still failing after ${retry.attempts} attempts: ${lastFailure}`,
      spec.method,
      spec.path,
      lastStatus,
    );
  }

  async function call(spec: RequestSpec): Promise<string> {
    const { status, text } = await send(spec);
    if (spec.ok.includes(status) || spec.done?.includes(status)) return text;
    throw new StorconError(
      `Storage controller ${spec.method} ${spec.path} returned ${status}: ${errorDetail(text)}`,
      spec.method,
      spec.path,
      status,
    );
  }

  async function callJson<T>(
    spec: RequestSpec,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<T> {
    const text = await call(spec);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new StorconError(
        `Storage controller ${spec.method} ${spec.path} returned non-JSON: ${text.slice(0, 200)}`,
        spec.method,
        spec.path,
        200,
      );
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new StorconError(
        `Storage controller ${spec.method} ${spec.path} returned an unexpected body: ${result.error.message}`,
        spec.method,
        spec.path,
        200,
      );
    }
    return result.data;
  }

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
