import { z } from "zod";
import { operationSchema, timestampSchema } from "./common.js";

/** Compute units: 1 CU is 1 vCPU and 4 GiB. */
export const COMPUTE_SIZES = ["0.25", "0.5", "1", "2", "4", "8"] as const;
export const computeSizeSchema = z.enum(COMPUTE_SIZES);
export type ComputeSize = z.infer<typeof computeSizeSchema>;

export const ENDPOINT_TYPES = ["read_write", "read_only"] as const;
export const endpointTypeSchema = z.enum(ENDPOINT_TYPES);
export type EndpointType = z.infer<typeof endpointTypeSchema>;

export const ENDPOINT_STATES = [
  "idle",
  "starting",
  "running",
  "suspending",
] as const;
export const endpointStateSchema = z.enum(ENDPOINT_STATES);
export type EndpointState = z.infer<typeof endpointStateSchema>;

/** Seven days; `0` means the compute never suspends. */
export const MAX_SUSPEND_TIMEOUT_SECONDS = 604_800;
export const DEFAULT_SUSPEND_TIMEOUT_SECONDS = 300;
export const DEFAULT_HISTORY_RETENTION_SECONDS = 86_400;
export const MAX_HISTORY_RETENTION_SECONDS = 2_592_000;

const suspendTimeoutSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_SUSPEND_TIMEOUT_SECONDS);

/** An IPv4 or IPv6 address, a CIDR block, or an `a-b` range: what the Neon proxy parses. */
const ipPatternSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[0-9a-fA-F:.]+(\/\d{1,3}|-[0-9a-fA-F:.]+)?$/, "Not an IP pattern");

/** Postgres LSN in `hi/lo` hexadecimal form, e.g. `0/16B5A50`. */
export const lsnSchema = z
  .string()
  .regex(/^[0-9A-Fa-f]{1,8}\/[0-9A-Fa-f]{1,8}$/, "Not a Postgres LSN");

const RESERVED_ROLE_NAMES = new Set([
  "cloud_admin",
  "neon_superuser",
  "postgres",
  "authenticator",
  "anonymous",
  "authenticated",
]);

const pgIdentifier = z
  .string()
  .regex(
    /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/,
    "Use letters, digits and underscores, starting with a letter or underscore (max 63)",
  );

export const roleNameSchema = pgIdentifier.refine(
  (name) =>
    !RESERVED_ROLE_NAMES.has(name.toLowerCase()) &&
    !name.toLowerCase().startsWith("pg_"),
  "This role name is reserved",
);
export const databaseNameSchema = pgIdentifier.refine(
  (name) =>
    !["postgres", "template0", "template1"].includes(name.toLowerCase()),
  "This database name is reserved",
);

// ---- resources -------------------------------------------------------------

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  pg_version: z.number().int(),
  history_retention_seconds: z.number().int(),
  /** `null` means the project does not restrict client IPs. */
  allowed_ips: z.array(ipPatternSchema).nullable(),
  created_at: timestampSchema,
});
export type Project = z.infer<typeof projectSchema>;

export const branchSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  parent_id: z.string().nullable(),
  parent_lsn: z.string().nullable(),
  is_default: z.boolean(),
  created_at: timestampSchema,
});
export type Branch = z.infer<typeof branchSchema>;

export const endpointSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  branch_id: z.string(),
  type: endpointTypeSchema,
  compute_size: computeSizeSchema,
  suspend_timeout_seconds: z.number().int(),
  state: endpointStateSchema,
  /** `ep-<name>-<n>.pg.alloydb.net`; append `-pooler` to the first label for PgBouncer. */
  host: z.string(),
  last_active_at: timestampSchema.nullable(),
  created_at: timestampSchema,
});
export type Endpoint = z.infer<typeof endpointSchema>;

export const roleSchema = z.object({
  name: z.string(),
  branch_id: z.string(),
  created_at: timestampSchema,
});
export type Role = z.infer<typeof roleSchema>;

/** Returned once, when a role is created or its password is reset. */
export const roleWithPasswordSchema = roleSchema.extend({
  password: z.string(),
});
export type RoleWithPassword = z.infer<typeof roleWithPasswordSchema>;

export const databaseSchema = z.object({
  id: z.string(),
  branch_id: z.string(),
  name: z.string(),
  owner_name: z.string(),
  data_api_enabled: z.boolean(),
  created_at: timestampSchema,
});
export type Database = z.infer<typeof databaseSchema>;

// ---- requests ----------------------------------------------------------------

const endpointSettings = {
  compute_size: computeSizeSchema.optional(),
  suspend_timeout_seconds: suspendTimeoutSchema.optional(),
};

export const createProjectRequestSchema = z.object({
  name: z.string().trim().min(1).max(64),
  pg_version: z.literal(17).optional(),
  history_retention_seconds: z
    .number()
    .int()
    .min(0)
    .max(MAX_HISTORY_RETENTION_SECONDS)
    .optional(),
  allowed_ips: z.array(ipPatternSchema).max(100).nullable().optional(),
  ...endpointSettings,
});
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

export const createBranchRequestSchema = z.object({
  name: z.string().trim().min(1).max(64),
  /** Defaults to the project's default branch. */
  parent_id: z.string().optional(),
  /** Branch from a point in the parent's history; defaults to its latest LSN. */
  parent_lsn: lsnSchema.optional(),
  /** When present, a `read_write` endpoint is created for the new branch. */
  endpoint: z.object(endpointSettings).optional(),
});
export type CreateBranchRequest = z.infer<typeof createBranchRequestSchema>;

export const createEndpointRequestSchema = z.object({
  branch_id: z.string(),
  type: endpointTypeSchema.optional(),
  ...endpointSettings,
});
export type CreateEndpointRequest = z.infer<typeof createEndpointRequestSchema>;

export const updateEndpointRequestSchema = z
  .object(endpointSettings)
  .refine(
    (body) =>
      body.compute_size !== undefined ||
      body.suspend_timeout_seconds !== undefined,
    "Provide compute_size or suspend_timeout_seconds",
  );
export type UpdateEndpointRequest = z.infer<typeof updateEndpointRequestSchema>;

export const createRoleRequestSchema = z.object({ name: roleNameSchema });
export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>;

export const createDatabaseRequestSchema = z.object({
  name: databaseNameSchema,
  owner_name: pgIdentifier,
});
export type CreateDatabaseRequest = z.infer<typeof createDatabaseRequestSchema>;

// ---- responses -----------------------------------------------------------------

export const listProjectsResponseSchema = z.object({
  projects: z.array(projectSchema),
});
export const projectResponseSchema = z.object({ project: projectSchema });

/** 202 of `POST /v1/projects`: everything created, with the owner's password shown once. */
export const createProjectResponseSchema = z.object({
  project: projectSchema,
  branch: branchSchema,
  endpoints: z.array(endpointSchema),
  roles: z.array(roleWithPasswordSchema),
  databases: z.array(databaseSchema),
  /** Connection URIs with the owner's password embedded. Shown once. */
  connection_uris: z.array(z.object({ connection_uri: z.string() })),
  operation: operationSchema,
});
export type CreateProjectResponse = z.infer<typeof createProjectResponseSchema>;

export const deleteProjectResponseSchema = z.object({
  project: projectSchema,
  operation: operationSchema,
});

export const listBranchesResponseSchema = z.object({
  branches: z.array(branchSchema),
});
export const branchResponseSchema = z.object({ branch: branchSchema });
export const createBranchResponseSchema = z.object({
  branch: branchSchema,
  endpoints: z.array(endpointSchema),
  operation: operationSchema,
});
export const deleteBranchResponseSchema = z.object({
  branch: branchSchema,
  operation: operationSchema,
});

export const listEndpointsResponseSchema = z.object({
  endpoints: z.array(endpointSchema),
});
export const endpointResponseSchema = z.object({ endpoint: endpointSchema });
/** 202 of every endpoint mutation (create, update, start, suspend, delete). */
export const endpointOperationResponseSchema = z.object({
  endpoint: endpointSchema,
  operation: operationSchema,
});

export const listRolesResponseSchema = z.object({ roles: z.array(roleSchema) });
export const roleOperationResponseSchema = z.object({
  role: roleWithPasswordSchema,
  operation: operationSchema,
});

export const listDatabasesResponseSchema = z.object({
  databases: z.array(databaseSchema),
});
export const databaseOperationResponseSchema = z.object({
  database: databaseSchema,
  operation: operationSchema,
});

// ---- Data API ---------------------------------------------------------------------

/** `PUT` and `DELETE /v1/projects/:id/branches/:branch/databases/:db/data_api`. */
export const dataApiToggleResponseSchema = z.object({
  database: databaseSchema,
  data_api: z.object({
    enabled: z.boolean(),
    /** `https://ep-<id>.apirest.alloydb.net/<db>/rest/v1`, or null when disabled. */
    url: z.string().nullable(),
  }),
  operation: operationSchema,
});
export type DataApiToggleResponse = z.infer<typeof dataApiToggleResponseSchema>;
