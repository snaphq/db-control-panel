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
import { ControlPlaneConfigError } from "./errors";
import {
  type TransportConfig,
  createTransport,
  pathSegment,
  queryString,
  readBaseUrl,
} from "./transport";

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
): TransportConfig {
  const token = env.ALLOYDB_API_TOKEN?.trim();
  if (!token) {
    throw new ControlPlaneConfigError(
      "ALLOYDB_API_TOKEN is not set; the console cannot reach the AlloyDB control plane.",
    );
  }
  return { baseUrl: readBaseUrl(env), token };
}

export function createControlPlaneClient(
  config: TransportConfig,
  scope: ControlPlaneScope,
) {
  const request = createTransport(config, {
    headers: {
      [ALLOYDB_ORG_HEADER]: scope.organizationId,
      [ALLOYDB_PROJECT_HEADER]: scope.projectId,
    },
    rejectedMessage:
      "The AlloyDB control plane rejected the console's credentials.",
  });

  const project = (id: string) => `/projects/${pathSegment(id)}`;
  const branch = (projectId: string, branchId: string) =>
    `${project(projectId)}/branches/${pathSegment(branchId)}`;

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
        `${project(projectId)}/endpoints/${pathSegment(endpointId)}/start`,
      ),
    suspendEndpoint: async (projectId: string, endpointId: string) =>
      request(
        endpointOperationResponseSchema,
        "POST",
        `${project(projectId)}/endpoints/${pathSegment(endpointId)}/suspend`,
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
        `${branch(projectId, branchId)}/roles/${pathSegment(role)}/reset_password`,
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
        `${branch(projectId, branchId)}/databases/${pathSegment(database)}/data_api`,
      ),

    // ---- operations
    getOperation: async (operationId: string) =>
      request(
        operationResponseSchema,
        "GET",
        `/operations/${pathSegment(operationId)}`,
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
        `/libsql/databases/${pathSegment(databaseId)}`,
      ),
    createLibsqlToken: async (
      databaseId: string,
      body: CreateLibsqlTokenRequest,
    ) =>
      request(
        libsqlTokenResponseSchema,
        "POST",
        `/libsql/databases/${pathSegment(databaseId)}/tokens`,
        body,
      ),
  };
}

export type ControlPlaneClient = ReturnType<typeof createControlPlaneClient>;

/** A client for one console project, configured from the environment. */
export function controlPlaneFor(scope: ControlPlaneScope): ControlPlaneClient {
  return createControlPlaneClient(readControlPlaneConfig(), scope);
}
