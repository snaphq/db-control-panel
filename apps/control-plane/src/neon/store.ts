import type {
  BranchSafekeepers,
  DataApiJwks,
  EndpointState,
  branch,
  database,
  endpoint,
  libsqlDatabase,
  neonProject,
  node,
  role,
} from '../db/schema.js';
import type { OperationRecord } from '../operations/store.js';

export type ProjectRow = typeof neonProject.$inferSelect;
export type BranchRow = typeof branch.$inferSelect;
export type EndpointRow = typeof endpoint.$inferSelect;
export type RoleRow = typeof role.$inferSelect;
export type DatabaseRow = typeof database.$inferSelect;
export type NodeRow = typeof node.$inferSelect;
export type LibsqlDatabaseRow = typeof libsqlDatabase.$inferSelect;

/**
 * Who is asking. Every console-facing query is filtered by both ids, so an id
 * from another organization or console project is simply "not found".
 */
export interface Scope {
  orgId: string;
  consoleProjectId: string;
}

/** A database with the branch and project it belongs to. */
export interface DatabaseContext {
  database: DatabaseRow;
  branch: BranchRow;
  project: ProjectRow;
}

/** An endpoint with the branch and project it belongs to. */
export interface EndpointContext {
  endpoint: EndpointRow;
  branch: BranchRow;
  project: ProjectRow;
}

/**
 * One row-level change of an operation's desired state. The request handler
 * decides what changes; the store applies them in the same transaction that
 * creates the operation row (see operations/repository.ts).
 */
export type DesiredStateChange =
  | { kind: 'project.insert'; row: typeof neonProject.$inferInsert }
  | { kind: 'project.markDeleted'; id: string }
  | { kind: 'branch.insert'; row: typeof branch.$inferInsert }
  | { kind: 'branch.markDeleted'; ids: string[] }
  | { kind: 'endpoint.insert'; row: typeof endpoint.$inferInsert }
  | {
      kind: 'endpoint.update';
      id: string;
      set: { computeSize?: string; suspendTimeoutSeconds?: number };
    }
  | { kind: 'endpoint.markDeleted'; ids: string[] }
  | { kind: 'role.insert'; row: typeof role.$inferInsert }
  | {
      kind: 'role.setSecret';
      branchId: string;
      name: string;
      scramSecret: string;
      /** The same password, sealed (crypto/secretbox.ts). */
      passwordEnc?: string;
    }
  | { kind: 'database.insert'; row: typeof database.$inferInsert }
  | { kind: 'database.delete'; branchId: string; name: string }
  | {
      kind: 'database.setDataApi';
      branchId: string;
      name: string;
      enabled: boolean;
      /** Set the sidecar position; omit to keep the one already assigned. */
      index?: number;
    }
  | { kind: 'branch.setAuthenticator'; branchId: string; passwordEnc: string }
  | {
      kind: 'project.setDataApiPlatformKey';
      projectId: string;
      jwks: DataApiJwks;
      signingKeyEnc: string;
    }
  /** Null returns the project to its platform key. */
  | {
      kind: 'project.setDataApiCustomJwks';
      projectId: string;
      jwks: DataApiJwks | null;
    }
  | { kind: 'libsql.insert'; row: typeof libsqlDatabase.$inferInsert }
  | { kind: 'libsql.markDeleted'; id: string };

export interface OperationInput {
  action: OperationRecord['action'];
  targetType: string;
  targetId: string;
  params?: Record<string, unknown>;
}

interface EndpointRunning {
  podName: string;
  podIp: string;
  at: Date;
}

interface NodeUpsert {
  id: number;
  name: string;
  tailscaleIp: string;
  zone: string;
  /** Merged into the node's existing roles. */
  addRoles: string[];
  /** Replaces the node's roles (Kubernetes labels are the source of truth); wins over `addRoles`. */
  roles?: string[];
  registeredPageserver?: boolean;
  /** Merged into the node's capacity object. */
  capacity?: Record<string, unknown>;
}

/**
 * Persistence of the Neon data model. The first group serves the console API
 * and is always scoped; the second serves the worker and neon-glue, which act
 * on ids the control plane itself handed out.
 */
export interface NeonStore {
  // ---- console API (scoped)
  listProjects(scope: Scope): Promise<ProjectRow[]>;
  findProject(scope: Scope, projectId: string): Promise<ProjectRow | null>;
  listBranches(scope: Scope, projectId: string): Promise<BranchRow[]>;
  findBranch(
    scope: Scope,
    projectId: string,
    branchId: string,
  ): Promise<BranchRow | null>;
  listEndpoints(
    scope: Scope,
    projectId: string,
    filter?: { branchId?: string },
  ): Promise<EndpointRow[]>;
  findEndpoint(
    scope: Scope,
    projectId: string,
    endpointId: string,
  ): Promise<EndpointRow | null>;
  listRoles(
    scope: Scope,
    projectId: string,
    branchId: string,
  ): Promise<RoleRow[]>;
  listDatabases(
    scope: Scope,
    projectId: string,
    branchId: string,
  ): Promise<DatabaseRow[]>;
  /**
   * Applies `changes` and records the operation atomically. Throws
   * `ProjectBusyError` when the console project already has an active
   * operation.
   */
  commit(
    scope: Scope,
    operation: OperationInput,
    changes: DesiredStateChange[],
  ): Promise<OperationRecord>;

  // ---- system (worker, neon-glue)
  getProject(
    projectId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<ProjectRow | null>;
  getBranch(
    branchId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<BranchRow | null>;
  getEndpointContext(
    endpointId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<EndpointContext | null>;
  /** A database by id, with its live branch and project. */
  getDatabaseContext(databaseId: string): Promise<DatabaseContext | null>;
  listProjectBranches(
    projectId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<BranchRow[]>;
  listBranchEndpoints(
    branchId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<EndpointRow[]>;
  listBranchRoles(branchId: string): Promise<RoleRow[]>;
  listBranchDatabases(branchId: string): Promise<DatabaseRow[]>;
  findProjectByTenant(tenantId: string): Promise<ProjectRow | null>;
  findBranchByTimeline(
    tenantId: string,
    timelineId: string,
  ): Promise<BranchRow | null>;
  /** Endpoints of a tenant's live branches that are in one of `states`. */
  listTenantEndpoints(
    tenantId: string,
    states: EndpointState[],
  ): Promise<EndpointRow[]>;
  listEndpointsInState(states: EndpointState[]): Promise<EndpointRow[]>;

  /**
   * Moves an endpoint from one of `from` to `to` if it is currently in one of
   * them and returns whether this call made the move. This is the cross-process
   * guard behind wake: only one caller wins `idle -> starting`. `staleBefore`
   * also lets a caller take over a `starting` claim older than that instant.
   */
  claimEndpointState(
    endpointId: string,
    from: EndpointState[],
    to: EndpointState,
    options?: { staleBefore?: Date; now?: Date },
  ): Promise<boolean>;
  markEndpointRunning(
    endpointId: string,
    running: EndpointRunning,
  ): Promise<void>;
  markEndpointIdle(endpointId: string): Promise<void>;
  touchEndpoint(endpointId: string, at: Date): Promise<void>;
  /**
   * Stores the placement the storage controller returned for a timeline.
   * Safekeeper placement only moves forward: an older generation is ignored.
   * Returns whether the stored value changed.
   */
  updateBranchPlacement(
    branchId: string,
    placement: { safekeepers?: BranchSafekeepers; parentLsn?: string },
  ): Promise<boolean>;

  upsertNode(input: NodeUpsert): Promise<void>;
  listNodes(): Promise<NodeRow[]>;
  /**
   * Tenant ids of the projects whose console project has an operation
   * scheduling or running, deleted projects included. A rebalance leaves these
   * tenants where they are.
   */
  listTenantsWithActiveOperations(): Promise<string[]>;
}
