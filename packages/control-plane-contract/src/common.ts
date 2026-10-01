import { z } from "zod";

/** Headers the console sets after its own membership checks. */
export const ALLOYDB_ORG_HEADER = "X-AlloyDB-Org";
export const ALLOYDB_PROJECT_HEADER = "X-AlloyDB-Project";

/** Every non-2xx response of the public API. */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const OPERATION_ACTIONS = [
  "project.create",
  "project.delete",
  "branch.create",
  "branch.delete",
  "endpoint.start",
  "endpoint.suspend",
  "endpoint.update",
  "role.reset_password",
  "database.create",
  "database.delete",
  "data_api.enable",
  "data_api.disable",
  "libsql.create",
  "libsql.delete",
  "libsql.fork",
] as const;
export const operationActionSchema = z.enum(OPERATION_ACTIONS);
export type OperationAction = z.infer<typeof operationActionSchema>;

export const OPERATION_STATUSES = [
  "scheduling",
  "running",
  "finished",
  "failed",
  "cancelled",
] as const;
export const operationStatusSchema = z.enum(OPERATION_STATUSES);
export type OperationStatus = z.infer<typeof operationStatusSchema>;

export const timestampSchema = z.string().datetime({ offset: true });

export const operationSchema = z.object({
  id: z.string(),
  target_type: z.string(),
  target_id: z.string(),
  action: operationActionSchema,
  status: operationStatusSchema,
  failures_count: z.number().int().nonnegative(),
  error: z.string().nullable(),
  created_at: timestampSchema,
  finished_at: timestampSchema.nullable(),
});
export type Operation = z.infer<typeof operationSchema>;

/** Body of `GET /v1/operations/:id`, and the `operation` field of every 202. */
export const operationResponseSchema = z.object({ operation: operationSchema });
export type OperationResponse = z.infer<typeof operationResponseSchema>;

/** `GET /v1/operations` and `GET /v1/projects/:project/operations` default and ceiling. */
export const DEFAULT_OPERATIONS_PAGE_SIZE = 50;
export const MAX_OPERATIONS_PAGE_SIZE = 100;

/**
 * Query of the operation list. `status=active` means `scheduling` or `running`,
 * the operations that still hold the project's lock; any other value is one
 * status. Results are newest first, and `cursor` is a previous `next_cursor`.
 */
export const listOperationsQuerySchema = z.object({
  status: z.union([z.literal("active"), operationStatusSchema]).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_OPERATIONS_PAGE_SIZE)
    .default(DEFAULT_OPERATIONS_PAGE_SIZE),
  cursor: z.string().min(1).max(128).optional(),
});
export type ListOperationsQuery = z.input<typeof listOperationsQuerySchema>;

export const listOperationsResponseSchema = z.object({
  operations: z.array(operationSchema),
  /** Pass as `cursor` for the next page; null on the last page. */
  next_cursor: z.string().nullable(),
});
export type ListOperationsResponse = z.infer<
  typeof listOperationsResponseSchema
>;
