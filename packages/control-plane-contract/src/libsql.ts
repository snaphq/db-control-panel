import { z } from "zod";
import { operationSchema, timestampSchema } from "./common.js";

export const LIBSQL_TOKEN_ACCESS = ["read_write", "read_only"] as const;
export const libsqlTokenAccessSchema = z.enum(LIBSQL_TOKEN_ACCESS);
export type LibsqlTokenAccess = z.infer<typeof libsqlTokenAccessSchema>;

/** Lowercase DNS label: it becomes the first label of the public hostname. */
export const libsqlDatabaseNameSchema = z
  .string()
  .regex(
    /^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$/,
    "Use lowercase letters, digits and hyphens (max 42)",
  );

export const libsqlDatabaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** sqld namespace, `<db>-<team>`. */
  namespace: z.string(),
  hostname: z.string(),
  /** `libsql://<namespace>.lite.alloydb.net` */
  url: z.string(),
  node_id: z.number().int(),
  state: z.string(),
  size_limit_bytes: z.number().int().nonnegative().nullable(),
  created_at: timestampSchema,
});
export type LibsqlDatabase = z.infer<typeof libsqlDatabaseSchema>;

export const createLibsqlDatabaseRequestSchema = z.object({
  name: libsqlDatabaseNameSchema,
  size_limit_bytes: z.number().int().positive().optional(),
});
export type CreateLibsqlDatabaseRequest = z.infer<
  typeof createLibsqlDatabaseRequestSchema
>;

export const forkLibsqlDatabaseRequestSchema = z.object({
  name: libsqlDatabaseNameSchema,
  /** Fork the data as of this instant; defaults to now. */
  timestamp: z.string().datetime({ offset: true }).optional(),
});
export type ForkLibsqlDatabaseRequest = z.infer<
  typeof forkLibsqlDatabaseRequestSchema
>;

export const createLibsqlTokenRequestSchema = z.object({
  access: libsqlTokenAccessSchema.default("read_write"),
  /** Omit for a token that never expires. */
  expires_in_seconds: z.number().int().positive().optional(),
});
export type CreateLibsqlTokenRequest = z.infer<
  typeof createLibsqlTokenRequestSchema
>;

export const libsqlTokenResponseSchema = z.object({
  token: z.string(),
  expires_at: timestampSchema.nullable(),
});
export type LibsqlTokenResponse = z.infer<typeof libsqlTokenResponseSchema>;

export const listLibsqlDatabasesResponseSchema = z.object({
  libsql_databases: z.array(libsqlDatabaseSchema),
});
export const libsqlDatabaseResponseSchema = z.object({
  libsql_database: libsqlDatabaseSchema,
});
export const libsqlOperationResponseSchema = z.object({
  libsql_database: libsqlDatabaseSchema,
  operation: operationSchema,
});
