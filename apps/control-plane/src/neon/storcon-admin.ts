import { z } from 'zod';
import {
  type StorconClientOptions,
  StorconError,
  createStorconTransport,
} from './storcon-http.js';

/**
 * Storage-controller calls behind the platform operations (pageserver
 * rebalancing and safekeeper spreading). Everything here was read in the Neon
 * source pinned in `infra/images/sources.env` (storage_controller/src/http.rs,
 * service.rs, service/safekeeper_service.rs, tenant_shard.rs,
 * libs/pageserver_api/src/controller_api.rs); the lines are cited per call.
 */

/** `reconcile` waits for at most `RECONCILE_TIMEOUT` = 30 s (service.rs:116). */
const MIGRATE_SHARD_TIMEOUT_MS = 60_000;
/**
 * `safekeeper_migrate` answers only after the whole membership change: each
 * quorum step may take 30 s and be retried (safekeeper_service.rs:916, :1020).
 */
const MIGRATE_TIMELINE_TIMEOUT_MS = 5 * 60_000;

// ---- wire types ---------------------------------------------------------------

/**
 * `TenantDescribeResponseShard` (controller_api.rs:177-196). `node_attached` is
 * the intent (where the controller wants the shard attached), which is what a
 * rebalance moves; reconcilers converge the pageservers to it.
 */
const tenantShardSchema = z.object({
  /** `TenantShardId`: 32 hex when unsharded, else `<32 hex>-<2 hex><2 hex>` (libs/utils/src/shard.rs:206-216). */
  tenant_shard_id: z.string(),
  node_attached: z.number().int().nullable(),
  node_secondary: z.array(z.number().int()),
  is_reconciling: z.boolean(),
  is_pending_compute_notification: z.boolean(),
  is_splitting: z.boolean(),
  is_importing: z.boolean(),
  /** `ShardSchedulingPolicy`: Active, Essential, Pause or Stop (controller_api.rs:341-360). */
  scheduling_policy: z.string(),
  preferred_az_id: z.string().nullable(),
});

/** `TenantDescribeResponse` (controller_api.rs:127-133). */
const tenantSchema = z.object({
  tenant_id: z.string(),
  shards: z.array(tenantShardSchema),
});
export type StorconTenant = z.infer<typeof tenantSchema>;

/** `TimelineLocateResponse` (libs/safekeeper_api/src/models.rs:323-327). */
const timelineLocationSchema = z.object({
  generation: z.number().int().nonnegative(),
  sk_set: z.array(z.number().int()),
  /** Present while a membership change is in flight. */
  new_sk_set: z.array(z.number().int()).nullable().optional(),
});
export type TimelineLocation = z.infer<typeof timelineLocationSchema>;

const preferredAzsResultSchema = z.object({
  updated: z.array(z.string()),
});

// ---- client -------------------------------------------------------------------

export interface MigrateShardInput {
  shardId: string;
  /** Destination pageserver. */
  nodeId: number;
  /** The controller refuses with 412 when the shard is no longer attached here. */
  originNodeId: number;
  /** Graceful: create a secondary, warm it, then cut over in the background. */
  prewarm: boolean;
}

export interface StorconAdminClient {
  /** Every tenant with its shards' placement. One call, no pagination. */
  listTenants(): Promise<StorconTenant[]>;
  /** The tenant's shards, or null when the controller does not know it. */
  describeTenant(tenantId: string): Promise<StorconTenant | null>;
  /**
   * Moves a shard's attachment. `done` means the controller answered 200 (the
   * reconcile finished, or with `prewarm` the graceful migration was started);
   * `pending` means it answered 408 because the reconcile was still running.
   * Neither says the shard is attached there yet: poll `describeTenant`.
   * A refusal (412 unavailable node, worse-scoring node or origin mismatch; 404
   * unknown shard; 400 unknown node) is thrown as a {@link StorconError}.
   */
  migrateShard(input: MigrateShardInput): Promise<'done' | 'pending'>;
  /** Sets the shards' preferred availability zone (`null` clears it). */
  setPreferredAzs(azs: Record<string, string | null>): Promise<string[]>;
  /** Where a timeline lives on safekeepers, or null for a timeline the controller does not manage. */
  locateTimeline(
    tenantId: string,
    timelineId: string,
  ): Promise<TimelineLocation | null>;
  /**
   * Moves a timeline to `newSkSet` (RFC-035 membership change). Synchronous:
   * resolves when the change is committed and announced. Safe to repeat with the
   * same set after a failure; throws {@link StorconError} (409: another set is
   * being migrated to; 400: invalid set; 404: unknown timeline; 500: a step
   * failed).
   */
  migrateTimeline(
    tenantId: string,
    timelineId: string,
    newSkSet: number[],
  ): Promise<void>;
  /** Cancels a membership change that has not committed yet; a no-op otherwise. */
  abortTimelineMigration(tenantId: string, timelineId: string): Promise<void>;
}

export function createStorconAdminClient(
  options: StorconClientOptions,
): StorconAdminClient {
  const { call, callJson } = createStorconTransport(options);
  const notFoundToNull = async <T>(work: Promise<T>): Promise<T | null> => {
    try {
      return await work;
    } catch (error) {
      if (error instanceof StorconError && error.status === 404) return null;
      throw error;
    }
  };

  return {
    async listTenants() {
      // Admin scope (http.rs:924); through `tenant_service_handler`, so the
      // controller answers 503 until its startup reconcile is done (http.rs:2487).
      return callJson(
        { method: 'GET', path: '/control/v1/tenant', ok: [200] },
        z.array(tenantSchema),
      );
    },

    async describeTenant(tenantId) {
      // Scrubber scope or admin (http.rs:877-893, route :2480); 404 when unknown
      // (service.rs:5579-5591).
      return notFoundToNull(
        callJson(
          {
            method: 'GET',
            path: `/control/v1/tenant/${tenantId}`,
            ok: [200],
          },
          tenantSchema,
        ),
      );
    },

    async migrateShard(input) {
      // `TenantShardMigrateRequest` (controller_api.rs:205-216): `node_id`, an
      // optional `origin_node_id` and `migration_config`. Admin scope, no rate
      // limit (http.rs:1337-1358, route :2446). Service logic is
      // `tenant_shard_migrate` (service.rs:6733-6895):
      //  - unavailable destination: 412 unless `override_scheduler`;
      //  - destination scores worse than the scheduler's best (az match first,
      //    then tenant affinity; load is ignored, tenant_shard.rs:915-950 and
      //    scheduler.rs:202-209): 412 "Migration to a worse-scoring node";
      //  - `origin_node_id` != current attachment: 412;
      //  - `prewarm: true` sets a preferred node and lets the optimiser create a
      //    warm secondary and cut over later, returning at once
      //    (service.rs:6664-6678); `false` re-points the intent and waits up to
      //    30 s for the reconcile, answering 408 if it is not done
      //    (service.rs:6680-6730, :6884-6890, http-utils error.rs:85-88).
      try {
        await call({
          method: 'PUT',
          path: `/control/v1/tenant/${input.shardId}/migrate`,
          body: {
            node_id: input.nodeId,
            origin_node_id: input.originNodeId,
            migration_config: { prewarm: input.prewarm },
          },
          ok: [200],
          timeoutMs: MIGRATE_SHARD_TIMEOUT_MS,
        });
        return 'done';
      } catch (error) {
        if (error instanceof StorconError && error.status === 408) {
          return 'pending';
        }
        throw error;
      }
    },

    async setPreferredAzs(azs) {
      // `ShardsPreferredAzsRequest` flattens a map of shard id to AZ
      // (controller_api.rs:94-98); admin scope (http.rs:1432-1450, route :2497).
      // The migrate check above compares against the shard's preferred AZ, so a
      // move to another AZ must change it first or the optimiser moves the shard
      // back (tenant_shard.rs:983-989, :1130-1160).
      const result = await callJson(
        {
          method: 'PUT',
          path: '/control/v1/preferred_azs',
          body: azs,
          ok: [200],
        },
        preferredAzsResultSchema,
      );
      return result.updated;
    },

    async locateTimeline(tenantId, timelineId) {
      // Admin scope (http.rs:1535-1558, route :2302); 404 when the timeline is
      // not in the controller's table (safekeeper_service.rs:493-520).
      return notFoundToNull(
        callJson(
          {
            method: 'GET',
            path: `/debug/v1/tenant/${tenantId}/timeline/${timelineId}/locate`,
            ok: [200],
          },
          timelineLocationSchema,
        ),
      );
    },

    async migrateTimeline(tenantId, timelineId, newSkSet) {
      // `TimelineSafekeeperMigrateRequest { new_sk_set }` (controller_api.rs:602-606),
      // PageServerApi or admin scope (http.rs:642-666, route :2622). The handler
      // (safekeeper_service.rs:1127-1426) requires: every id registered, no
      // duplicates, at least `--timeline-safekeeper-count` members, no member
      // that is Decomissioned unless it is already in the set. It then runs the
      // RFC-035 steps to completion before answering 200: persist the joint
      // set, notify the compute hook, switch membership on the old set, pull
      // the timeline from the old set to each new member, wait for them to catch
      // up, commit the new set, exclude the dropped members and notify again.
      // Re-sending the same `new_sk_set` after a failure resumes (:1215-1232); a
      // different set while one is pending is 409.
      await call({
        method: 'POST',
        path: `/v1/tenant/${tenantId}/timeline/${timelineId}/safekeeper_migrate`,
        body: { new_sk_set: newSkSet },
        ok: [200],
        timeoutMs: MIGRATE_TIMELINE_TIMEOUT_MS,
        attempts: 2,
      });
    },

    async abortTimelineMigration(tenantId, timelineId) {
      // http.rs:669-684, route :2632; service logic safekeeper_service.rs:1628-1737.
      // Only possible before the new set is committed (step 8); afterwards it
      // retries the finish step and returns 200.
      await call({
        method: 'POST',
        path: `/v1/tenant/${tenantId}/timeline/${timelineId}/safekeeper_migrate_abort`,
        ok: [200],
        timeoutMs: MIGRATE_TIMELINE_TIMEOUT_MS,
        attempts: 2,
      });
    },
  };
}
