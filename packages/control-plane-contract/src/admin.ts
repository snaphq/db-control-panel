import { z } from "zod";
import { operationStatusSchema, timestampSchema } from "./common.js";

/**
 * Platform-wide operations. They are not scoped to an organization or console
 * project and take their own lock (one at a time), not a project's. They are
 * kept apart from `OPERATION_ACTIONS` so the console's per-project labels and
 * tables never meet them.
 */
export const PLATFORM_OPERATION_ACTIONS = [
  "pageservers.rebalance",
  "safekeepers.spread",
] as const;
export const platformOperationActionSchema = z.enum(PLATFORM_OPERATION_ACTIONS);
export type PlatformOperationAction = z.infer<
  typeof platformOperationActionSchema
>;

/**
 * The platform admin API, `/v1/admin/*`. It takes its own bearer token
 * (`ALLOYDB_ADMIN_API_TOKEN`, not the console's) and no organization or project
 * headers: nothing here belongs to a customer. Only the platform admin portal
 * calls it.
 */

/** A platform operation, with the plan and progress the admin portal shows. */
export const platformOperationSchema = z.object({
  id: z.string(),
  action: platformOperationActionSchema,
  status: operationStatusSchema,
  failures_count: z.number().int().nonnegative(),
  error: z.string().nullable(),
  /** What started it, for example `{reason: "manual"}` or `{reason: "pageserver-joined", nodeIds: [4]}`. */
  params: z.record(z.unknown()),
  /** Finished step names, and each step's output (a running step shows its checkpoint). */
  progress: z.object({
    completed_steps: z.array(z.string()),
    outputs: z.record(z.unknown()),
  }),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  finished_at: timestampSchema.nullable(),
});
export type PlatformOperation = z.infer<typeof platformOperationSchema>;

/** Body of `POST /v1/admin/pageservers/rebalance` and `POST /v1/admin/safekeepers/spread` (202), and of `GET /v1/admin/operations/:id`. */
export const platformOperationResponseSchema = z.object({
  operation: platformOperationSchema,
});
export type PlatformOperationResponse = z.infer<
  typeof platformOperationResponseSchema
>;

export const DEFAULT_PLATFORM_OPERATIONS_PAGE_SIZE = 50;
export const MAX_PLATFORM_OPERATIONS_PAGE_SIZE = 100;

/** Query of `GET /v1/admin/operations`; `scope=platform` is the only scope. */
export const listPlatformOperationsQuerySchema = z.object({
  scope: z.literal("platform").default("platform"),
  status: z.union([z.literal("active"), operationStatusSchema]).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PLATFORM_OPERATIONS_PAGE_SIZE)
    .default(DEFAULT_PLATFORM_OPERATIONS_PAGE_SIZE),
  cursor: z.string().min(1).max(128).optional(),
});
export type ListPlatformOperationsQuery = z.input<
  typeof listPlatformOperationsQuerySchema
>;

export const listPlatformOperationsResponseSchema = z.object({
  operations: z.array(platformOperationSchema),
  next_cursor: z.string().nullable(),
});
export type ListPlatformOperationsResponse = z.infer<
  typeof listPlatformOperationsResponseSchema
>;

// ---- nodes ---------------------------------------------------------------------

export const SAFEKEEPER_STATES = [
  "creating",
  "active",
  "retiring",
  "retired",
] as const;
export const safekeeperStateSchema = z.enum(SAFEKEEPER_STATES);
export type SafekeeperState = z.infer<typeof safekeeperStateSchema>;

/** The storage-plane state of a node's pageserver, as the worker last saw it. */
export const adminPageserverSchema = z.object({
  /** The pageserver has registered itself with the storage controller. */
  registered: z.boolean(),
  /** The controller's `availability`: Active, WarmingUp or Offline; null until seen. */
  availability: z.string().nullable(),
  /** The controller's scheduling policy: Active, Pause, Draining, and so on. */
  scheduling: z.string().nullable(),
  /** Tenant shards attached to it; null until the controller has been asked. */
  attached_shards: z.number().int().nonnegative().nullable(),
  observed_at: timestampSchema.nullable(),
});
export type AdminPageserver = z.infer<typeof adminPageserverSchema>;

export const adminNodeSchema = z.object({
  /** `alloydb.net/node-id`. */
  id: z.number().int(),
  /** Kubernetes node name. */
  name: z.string(),
  /** `kubernetes.io/hostname`, what a pod's node selector matches. */
  hostname: z.string(),
  zone: z.string(),
  tailscale_ip: z.string(),
  /** Of pageserver, libsql, compute. */
  roles: z.array(z.string()),
  ready: z.boolean(),
  /** The node left the cluster; its row stays because data may still refer to it. */
  missing: z.boolean(),
  /** The `alloydb.net/*` labels and the zone. */
  labels: z.record(z.string()),
  /** Allocatable resources; null when Kubernetes did not report them. */
  allocatable: z.object({
    cpu_millis: z.number().int().nullable(),
    memory_bytes: z.number().int().nullable(),
    storage_bytes: z.number().int().nullable(),
  }),
  /** Null on a node that runs no pageserver. */
  pageserver: adminPageserverSchema.nullable(),
  /** Safekeepers placed on the node that are not retired. */
  safekeepers: z.array(
    z.object({ id: z.number().int(), state: safekeeperStateSchema }),
  ),
  /** Live libSQL databases on the node. */
  libsql_databases: z.number().int().nonnegative(),
  updated_at: timestampSchema,
});
export type AdminNode = z.infer<typeof adminNodeSchema>;

export const adminNodesResponseSchema = z.object({
  nodes: z.array(adminNodeSchema),
});
export type AdminNodesResponse = z.infer<typeof adminNodesResponseSchema>;

// ---- safekeepers ---------------------------------------------------------------

export const adminSafekeeperSchema = z.object({
  /** The storage-controller node id; never reused. */
  id: z.number().int(),
  node_id: z.number().int(),
  node_name: z.string(),
  /** Always `az-<id>`: each safekeeper is its own logical zone. */
  availability_zone: z.string(),
  /** The address registered with the controller. */
  hostname: z.string(),
  state: safekeeperStateSchema,
  /** The spread operation that created it; null for the first three. */
  operation_id: z.string().nullable(),
  /** Progress of moving its timelines away, while it is retiring. */
  drain: z
    .object({
      total: z.number().int().nonnegative(),
      migrated: z.number().int().nonnegative(),
      failed: z.array(z.object({ timeline: z.string(), reason: z.string() })),
      updated_at: timestampSchema,
    })
    .nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  retired_at: timestampSchema.nullable(),
});
export type AdminSafekeeper = z.infer<typeof adminSafekeeperSchema>;

/** What the layout policy would do now, the same plan a spread operation starts from. */
export const adminSafekeeperLayoutSchema = z.object({
  /** Safekeepers wanted (the controller's `--timeline-safekeeper-count`). */
  desired_count: z.number().int().positive(),
  /** Wanted safekeepers per eligible Ready node id. */
  target_per_node: z.record(z.number().int().nonnegative()),
  /** Nodes to start missing safekeepers on, in order (the worker does this by itself). */
  create_on_nodes: z.array(z.number().int()),
  /** The one safekeeper a spread would replace, or null when the layout is as wide as the nodes allow. */
  next_move: z
    .object({
      remove_safekeeper: z.number().int(),
      from_node_id: z.number().int(),
      to_node_id: z.number().int(),
    })
    .nullable(),
  /** Safekeepers on a node that is gone or not Ready; never moved automatically. */
  stranded: z.array(z.number().int()),
  /** Why nothing can be planned, for example no eligible Ready node. */
  blocked: z.string().nullable(),
});
export type AdminSafekeeperLayout = z.infer<typeof adminSafekeeperLayoutSchema>;

export const adminSafekeepersResponseSchema = z.object({
  safekeepers: z.array(adminSafekeeperSchema),
  layout: adminSafekeeperLayoutSchema,
});
export type AdminSafekeepersResponse = z.infer<
  typeof adminSafekeepersResponseSchema
>;
