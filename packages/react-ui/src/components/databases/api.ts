import type {
  CreateBranchRequest,
  CreateLibsqlTokenRequest,
  CreateProjectRequest,
  Operation,
} from "@repo/control-plane-contract";
import type { ControlPlaneClient } from "@repo/core/control-plane/client";
import type { DatabasesOverview } from "@repo/core/control-plane/overview";

type Result<K extends keyof ControlPlaneClient> = Awaited<
  ReturnType<ControlPlaneClient[K]>
>;

type CreateProjectResult = Result<"createProject">;
type CreateBranchResult = Result<"createBranch">;
type ResetPasswordResult = Result<"resetRolePassword">;
type CreateLibsqlResult = Result<"createLibsqlDatabase">;
type CreateTokenResult = Result<"createLibsqlToken">;

/** A failed call to the console's databases API, with the server's message. */
class DatabasesApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "DatabasesApiError";
    this.status = status;
    this.code = code;
  }
}

const BUSY_MESSAGE =
  "Another change is in progress. Wait for it to finish, then try again.";

export function errorMessage(error: unknown): string {
  if (error instanceof DatabasesApiError) {
    return error.code === "busy" ? BUSY_MESSAGE : error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

async function call<T>(
  url: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = (payload ?? {}) as { error?: string; code?: string };
    throw new DatabasesApiError(
      failure.error ?? `Request failed (${response.status})`,
      response.status,
      failure.code ?? "unknown",
    );
  }
  return payload as T;
}

const part = encodeURIComponent;

/** The browser's view of `/api/projects/[id]/databases/**`. */
export function databasesApi(projectId: string) {
  const root = `/api/projects/${part(projectId)}`;
  const neon = (neonId: string) => `${root}/databases/neon/${part(neonId)}`;
  const branch = (neonId: string, branchId: string) =>
    `${neon(neonId)}/branches/${part(branchId)}`;
  const libsql = (id: string) => `${root}/databases/libsql/${part(id)}`;

  return {
    overview: () => call<DatabasesOverview>(`${root}/databases`, "GET"),
    operation: (operationId: string) =>
      call<{ operation: Operation }>(
        `${root}/operations/${part(operationId)}`,
        "GET",
      ),
    createProject: (body: CreateProjectRequest) =>
      call<CreateProjectResult>(`${root}/databases`, "POST", body),
    deleteProject: (neonId: string) =>
      call<{ operation: Operation }>(neon(neonId), "DELETE"),
    createBranch: (neonId: string, body: CreateBranchRequest) =>
      call<CreateBranchResult>(`${neon(neonId)}/branches`, "POST", body),
    deleteBranch: (neonId: string, branchId: string) =>
      call<{ operation: Operation }>(branch(neonId, branchId), "DELETE"),
    endpointAction: (
      neonId: string,
      endpointId: string,
      action: "start" | "suspend",
    ) =>
      call<{ operation: Operation }>(
        `${neon(neonId)}/endpoints/${part(endpointId)}/${action}`,
        "POST",
      ),
    resetPassword: (neonId: string, branchId: string, role: string) =>
      call<ResetPasswordResult>(
        `${branch(neonId, branchId)}/roles/${part(role)}/reset-password`,
        "POST",
      ),
    setDataApi: (
      neonId: string,
      branchId: string,
      database: string,
      enabled: boolean,
    ) =>
      call<{ operation: Operation }>(
        `${branch(neonId, branchId)}/databases/${part(database)}/data-api`,
        enabled ? "PUT" : "DELETE",
      ),
    createLibsql: (name: string) =>
      call<CreateLibsqlResult>(`${root}/databases/libsql`, "POST", { name }),
    deleteLibsql: (id: string) =>
      call<{ operation: Operation }>(libsql(id), "DELETE"),
    createToken: (id: string, body: CreateLibsqlTokenRequest) =>
      call<CreateTokenResult>(`${libsql(id)}/tokens`, "POST", body),
  };
}

export type DatabasesApi = ReturnType<typeof databasesApi>;
