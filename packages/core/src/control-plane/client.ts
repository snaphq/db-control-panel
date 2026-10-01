import "server-only";
import {
  ALLOYDB_ORG_HEADER,
  ALLOYDB_PROJECT_HEADER,
  type CreateBranchRequest,
  type CreateLibsqlDatabaseRequest,
  type CreateLibsqlTokenRequest,
  type CreateProjectRequest,
  type ListOperationsQuery,
  createBranchResponseSchema,
  createProjectResponseSchema,
  dataApiToggleResponseSchema,
  deleteBranchResponseSchema,
  deleteProjectResponseSchema,
  endpointOperationResponseSchema,
  errorResponseSchema,
  libsqlOperationResponseSchema,
  libsqlTokenResponseSchema,
  listBranchesResponseSchema,
  listDatabasesResponseSchema,
  listEndpointsResponseSchema,
  listLibsqlDatabasesResponseSchema,
  listOperationsResponseSchema,
  listProjectsResponseSchema,
  listRolesResponseSchema,
  operationResponseSchema,
  roleOperationResponseSchema,
} from "@repo/control-plane-contract";
import type { ZodType, ZodTypeDef } from "zod";
import {
  ControlPlaneBusyError,
  ControlPlaneConfigError,
  type ControlPlaneError,
  ControlPlaneNotFoundError,
  ControlPlaneRequestError,
  ControlPlaneUnavailableError,
} from "./errors";

export const DEFAULT_CONTROL_PLANE_URL = "https://api.alloydb.net";
const REQUEST_TIMEOUT_MS = 15_000;

export interface ControlPlaneConfig {
  baseUrl: string;
  token: string;
  /** Replaceable for tests. */
  fetch?: typeof fetch;
}

/**
 * The two ids the control plane scopes every query by. They must come from
 * the console's own database after a membership check, never from a request.
 */
export interface ControlPlaneScope {
  organizationId: string;
  projectId: string;
}

/** Reads `ALLOYDB_API_URL` (default https://api.alloydb.net) and `ALLOYDB_API_TOKEN`. */
export function readControlPlaneConfig(
  env: Record<string, string | undefined> = process.env,
): ControlPlaneConfig {
  const token = env.ALLOYDB_API_TOKEN?.trim();
  if (!token) {
    throw new ControlPlaneConfigError(
      "ALLOYDB_API_TOKEN is not set; the console cannot reach the AlloyDB control plane.",
    );
  }
  const baseUrl = (
    env.ALLOYDB_API_URL?.trim() || DEFAULT_CONTROL_PLANE_URL
  ).replace(/\/+$/, "");
  return { baseUrl, token };
}

type Method = "GET" | "POST" | "PUT" | "DELETE";
type Schema<T> = ZodType<T, ZodTypeDef, unknown>;

const SAFE_SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,127}$/;

/** Encodes one path segment; refuses anything that could climb out of it. */
function segment(value: string): string {
  if (!SAFE_SEGMENT.test(value)) {
    throw new ControlPlaneRequestError(
      "That identifier is not valid.",
      400,
      "invalid_id",
    );
  }
  return encodeURIComponent(value);
}

/** `?status=active&limit=20`, or nothing; parameters left undefined are dropped. */
function queryString(query: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

async function errorFrom(response: Response): Promise<ControlPlaneError> {
  const parsed = errorResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  const code = parsed.success ? parsed.data.error.code : "unknown";
  const message = parsed.success
    ? parsed.data.error.message
    : `Control plane answered ${response.status}`;
  const { status } = response;
  if (status === 423) return new ControlPlaneBusyError(message);
  if (status === 404) return new ControlPlaneNotFoundError(message, code);
  if (status === 401 || status === 403) {
    // The console's own token was refused: an operator problem, not the user's.
    return new ControlPlaneUnavailableError(
      "The AlloyDB control plane rejected the console's credentials.",
      status,
      code,
    );
  }
  if (status >= 500) {
    return new ControlPlaneUnavailableError(message, status, code);
  }
  return new ControlPlaneRequestError(message, status, code);
}

export function createControlPlaneClient(
  config: ControlPlaneConfig,
  scope: ControlPlaneScope,
) {
  const doFetch = config.fetch ?? fetch;

  async function request<T>(
    schema: Schema<T>,
    method: Method,
    path: string,
    body?: unknown,
  ): Promise<T> {
    let response: Response;
    try {
      response = await doFetch(`${config.baseUrl}/v1${path}`, {
        method,
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          authorization: `Bearer ${config.token}`,
          [ALLOYDB_ORG_HEADER]: scope.organizationId,
          [ALLOYDB_PROJECT_HEADER]: scope.projectId,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      throw new ControlPlaneUnavailableError(
        `The AlloyDB control plane is unreachable: ${cause instanceof Error ? cause.message : String(cause)}`,
        0,
        "unreachable",
      );
    }
    if (!response.ok) throw await errorFrom(response);
    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new ControlPlaneUnavailableError(
        "The AlloyDB control plane sent a response the console does not understand.",
        response.status,
        "invalid_response",
      );
    }
    return parsed.data;
  }

  const project = (id: string) => `/projects/${segment(id)}`;
  const branch = (projectId: string, branchId: string) =>
    `${project(projectId)}/branches/${segment(branchId)}`;

  return {
    // ---- Neon projects
    listProjects: async () =>
      request(listProjectsResponseSchema, "GET", "/projects"),
    createProject: async (body: CreateProjectRequest) =>
      request(createProjectResponseSchema, "POST", "/projects", body),
    deleteProject: async (projectId: string) =>
      request(deleteProjectResponseSchema, "DELETE", project(projectId)),

    // ---- branches
    listBranches: async (projectId: string) =>
      request(
        listBranchesResponseSchema,
        "GET",
        `${project(projectId)}/branches`,
      ),
    createBranch: async (projectId: string, body: CreateBranchRequest) =>
      request(
        createBranchResponseSchema,
        "POST",
        `${project(projectId)}/branches`,
        body,
      ),
    deleteBranch: async (projectId: string, branchId: string) =>
      request(
        deleteBranchResponseSchema,
        "DELETE",
        branch(projectId, branchId),
      ),

    // ---- endpoints
    listEndpoints: async (projectId: string) =>
      request(
        listEndpointsResponseSchema,
        "GET",
        `${project(projectId)}/endpoints`,
      ),
    startEndpoint: async (projectId: string, endpointId: string) =>
      request(
        endpointOperationResponseSchema,
        "POST",
        `${project(projectId)}/endpoints/${segment(endpointId)}/start`,
      ),
    suspendEndpoint: async (projectId: string, endpointId: string) =>
      request(
        endpointOperationResponseSchema,
        "POST",
        `${project(projectId)}/endpoints/${segment(endpointId)}/suspend`,
      ),

    // ---- roles and databases
    listRoles: async (projectId: string, branchId: string) =>
      request(
        listRolesResponseSchema,
        "GET",
        `${branch(projectId, branchId)}/roles`,
      ),
    resetRolePassword: async (
      projectId: string,
      branchId: string,
      role: string,
    ) =>
      request(
        roleOperationResponseSchema,
        "POST",
        `${branch(projectId, branchId)}/roles/${segment(role)}/reset_password`,
      ),
    listDatabases: async (projectId: string, branchId: string) =>
      request(
        listDatabasesResponseSchema,
        "GET",
        `${branch(projectId, branchId)}/databases`,
      ),
    setDataApi: async (
      projectId: string,
      branchId: string,
      database: string,
      enabled: boolean,
    ) =>
      request(
        dataApiToggleResponseSchema,
        enabled ? "PUT" : "DELETE",
        `${branch(projectId, branchId)}/databases/${segment(database)}/data_api`,
      ),

    // ---- operations
    getOperation: async (operationId: string) =>
      request(
        operationResponseSchema,
        "GET",
        `/operations/${segment(operationId)}`,
      ),
    /**
     * Newest first. With `projectId` it is the Postgres project's list
     * (`/projects/:id/operations`); without, the console project's whole list,
     * which also holds libSQL operations. Both are scoped by the client's ids.
     */
    listOperations: async (
      query: ListOperationsQuery = {},
      projectId?: string,
    ) =>
      request(
        listOperationsResponseSchema,
        "GET",
        `${projectId === undefined ? "" : project(projectId)}/operations${queryString(query)}`,
      ),

    // ---- libSQL (paths under /v1/libsql; not served by the control plane yet)
    listLibsqlDatabases: async () =>
      request(listLibsqlDatabasesResponseSchema, "GET", "/libsql/databases"),
    createLibsqlDatabase: async (body: CreateLibsqlDatabaseRequest) =>
      request(libsqlOperationResponseSchema, "POST", "/libsql/databases", body),
    deleteLibsqlDatabase: async (databaseId: string) =>
      request(
        libsqlOperationResponseSchema,
        "DELETE",
        `/libsql/databases/${segment(databaseId)}`,
      ),
    createLibsqlToken: async (
      databaseId: string,
      body: CreateLibsqlTokenRequest,
    ) =>
      request(
        libsqlTokenResponseSchema,
        "POST",
        `/libsql/databases/${segment(databaseId)}/tokens`,
        body,
      ),
  };
}

export type ControlPlaneClient = ReturnType<typeof createControlPlaneClient>;

/** A client for one console project, configured from the environment. */
export function controlPlaneFor(scope: ControlPlaneScope): ControlPlaneClient {
  return createControlPlaneClient(readControlPlaneConfig(), scope);
}
