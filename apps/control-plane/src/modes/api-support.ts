import { randomBytes } from 'node:crypto';
import type {
  Branch,
  Database,
  Endpoint,
  Operation,
  Project,
  Role,
  RoleWithPassword,
} from '@repo/control-plane-contract';
import type { Context } from 'hono';
import type { z } from 'zod';
import type { SecretBox } from '../crypto/secretbox.js';
import type { ComputeSize } from '../neon/compute-size.js';
import type {
  BranchRow,
  DatabaseRow,
  EndpointRow,
  NeonStore,
  ProjectRow,
  RoleRow,
  Scope,
} from '../neon/store.js';
import type { OperationRecord } from '../operations/store.js';

/** Identity the console asserts after its own membership checks. */
interface ConsoleIdentity {
  org: string;
  project: string;
}

export type ApiEnv = { Variables: { identity: ConsoleIdentity } };
export type ApiContext = Context<ApiEnv>;

export interface NeonApiDeps {
  store: NeonStore;
  /** Domain endpoint hosts live under, e.g. `pg.alloydb.net`. */
  pgHostSuffix: string;
  /** Data API hosts are `<endpoint id>.<suffix>`, e.g. `apirest.alloydb.net`. */
  dataApiHostSuffix: string;
  /** Seals the role passwords the Data API bootstrap needs back. */
  secrets: SecretBox;
}

/** Every query is filtered by these two ids. */
export function scopeOf(c: ApiContext): Scope {
  const { org, project } = c.get('identity');
  return { orgId: org, consoleProjectId: project };
}

export function apiError(
  c: ApiContext,
  status: 400 | 404 | 409 | 422,
  code: string,
  message: string,
) {
  return c.json({ error: { code, message } }, status);
}

export const notFound = (c: ApiContext, what: string) =>
  apiError(c, 404, 'not_found', `${what} not found`);

type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

function validate<T>(
  c: ApiContext,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  raw: unknown,
): Parsed<T> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const message = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
    .join('; ');
  return { ok: false, response: apiError(c, 400, 'bad_request', message) };
}

/** Parses the query string with a contract schema; failures answer 400 with every issue named. */
export function parseQuery<T>(
  c: ApiContext,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Parsed<T> {
  return validate(c, schema, c.req.query());
}

/** Parses the JSON body with a contract schema; failures answer 400 with every issue named. */
export async function parseBody<T>(
  c: ApiContext,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<Parsed<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return {
      ok: false,
      response: apiError(c, 400, 'bad_request', 'Request body must be JSON'),
    };
  }
  return validate(c, schema, raw);
}

/** Like {@link parseBody}, but a request without a body means `{}` (every field defaulted). */
export async function parseOptionalBody<T>(
  c: ApiContext,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<Parsed<T>> {
  const text = await c.req.text();
  if (!text.trim()) return validate(c, schema, {});
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      response: apiError(c, 400, 'bad_request', 'Request body must be JSON'),
    };
  }
  return validate(c, schema, raw);
}

export function toOperationResponse(record: OperationRecord): Operation {
  return {
    id: record.id,
    target_type: record.targetType,
    target_id: record.targetId,
    action: record.action,
    status: record.status,
    failures_count: record.failuresCount,
    error: record.error,
    created_at: record.createdAt.toISOString(),
    finished_at: record.finishedAt?.toISOString() ?? null,
  };
}

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    pg_version: row.pgVersion,
    history_retention_seconds: row.historyRetentionSeconds,
    allowed_ips: row.allowedIps,
    created_at: row.createdAt.toISOString(),
  };
}

export function toBranch(row: BranchRow): Branch {
  return {
    id: row.id,
    project_id: row.projectId,
    name: row.name,
    parent_id: row.parentBranchId,
    parent_lsn: row.parentLsn,
    is_default: row.isDefault,
    created_at: row.createdAt.toISOString(),
  };
}

/** `projectId` is passed in because the endpoint row only knows its branch. */
export function toEndpoint(
  row: EndpointRow,
  projectId: string,
  pgHostSuffix: string,
): Endpoint {
  return {
    id: row.id,
    project_id: projectId,
    branch_id: row.branchId,
    type: row.type,
    compute_size: row.computeSize as ComputeSize,
    suspend_timeout_seconds: row.suspendTimeoutSeconds,
    state: row.state,
    host: `${row.id}.${pgHostSuffix}`,
    last_active_at: row.lastActiveAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

export function toRole(row: RoleRow): Role {
  return {
    name: row.name,
    branch_id: row.branchId,
    created_at: row.createdAt.toISOString(),
  };
}

export function toRoleWithPassword(
  row: RoleRow,
  password: string,
): RoleWithPassword {
  return { ...toRole(row), password };
}

/**
 * The public URL of a database's Data API, or null while it is disabled or the
 * branch has no `read_write` endpoint (`writerId`) for the gateway to route to.
 */
export function dataApiUrl(
  row: Pick<DatabaseRow, 'name' | 'dataApiEnabled'>,
  writerId: string | null | undefined,
  hostSuffix: string,
): string | null {
  if (!row.dataApiEnabled || !writerId) return null;
  return `https://${writerId}.${hostSuffix}/${row.name}/rest/v1`;
}

/** Id of the branch's `read_write` endpoint, which serves its Data API. */
export async function writerEndpointId(
  store: NeonStore,
  scope: Scope,
  projectId: string,
  branchId: string,
): Promise<string | null> {
  const endpoints = await store.listEndpoints(scope, projectId, { branchId });
  return endpoints.find((e) => e.type === 'read_write')?.id ?? null;
}

export function toDatabase(
  row: DatabaseRow,
  dataApiUrl: string | null,
): Database {
  return {
    id: row.id,
    branch_id: row.branchId,
    name: row.name,
    owner_name: row.ownerRole,
    data_api_enabled: row.dataApiEnabled,
    data_api_url: dataApiUrl,
    created_at: row.createdAt.toISOString(),
  };
}

/** 24 URL-safe characters (144 bits). The control plane keeps only the SCRAM secret. */
export function newPassword(): string {
  return randomBytes(18).toString('base64url');
}
