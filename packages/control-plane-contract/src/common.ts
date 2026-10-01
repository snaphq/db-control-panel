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
