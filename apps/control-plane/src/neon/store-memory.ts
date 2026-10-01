import { newId } from '../crypto/ids.js';
import { ProjectBusyError } from '../operations/repository.js';
import type { OperationRecord } from '../operations/store.js';
import type {
  BranchRow,
  DatabaseRow,
  DesiredStateChange,
  EndpointRow,
  NeonStore,
  NodeRow,
  ProjectRow,
  RoleRow,
  Scope,
} from './store.js';

export interface MemoryNeonStore extends NeonStore {
  projects: Map<string, ProjectRow>;
  branches: Map<string, BranchRow>;
  endpoints: Map<string, EndpointRow>;
  roles: RoleRow[];
  databases: DatabaseRow[];
  nodes: Map<number, NodeRow>;
  operations: Map<string, OperationRecord>;
  /** Replaces the clock used for `createdAt`/`deletedAt`; tests pin it. */
  setNow(now: Date): void;
}

/**
 * In-memory {@link NeonStore} with the same scoping and locking rules as the
 * Drizzle one; both run the shared contract suite (store.contract.ts).
 */
export function createMemoryNeonStore(): MemoryNeonStore {
  const projects = new Map<string, ProjectRow>();
  const branches = new Map<string, BranchRow>();
  const endpoints = new Map<string, EndpointRow>();
  const roles: RoleRow[] = [];
  const databases: DatabaseRow[] = [];
  const nodes = new Map<number, NodeRow>();
  const operations = new Map<string, OperationRecord>();
  let now = new Date('2026-01-01T00:00:00Z');

  const owns = (scope: Scope, project: ProjectRow | undefined): boolean =>
    project !== undefined &&
    project.deletedAt === null &&
    project.consoleProjectId === scope.consoleProjectId &&
    project.consoleOrgId === scope.orgId;

  const scopedBranch = (scope: Scope, projectId: string, branchId: string) => {
    const found = branches.get(branchId);
    if (!found || found.deletedAt || found.projectId !== projectId) return null;
    return owns(scope, projects.get(projectId)) ? found : null;
  };

  const byCreatedAt = <T extends { createdAt: Date }>(rows: T[]): T[] =>
    [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  function apply(change: DesiredStateChange): void {
    switch (change.kind) {
      case 'project.insert': {
        const live = [...projects.values()].some(
          (p) =>
            p.deletedAt === null &&
            p.consoleProjectId === change.row.consoleProjectId,
        );
        if (live) throw new Error('duplicate live console project');
        projects.set(change.row.id, {
          pgVersion: 17,
          historyRetentionSeconds: 86_400,
          allowedIps: null,
          createdAt: now,
          deletedAt: null,
          ...change.row,
        });
        return;
      }
      case 'project.markDeleted': {
        const found = projects.get(change.id);
        if (found) found.deletedAt = now;
        return;
      }
      case 'branch.insert':
        branches.set(change.row.id, {
          parentBranchId: null,
          parentLsn: null,
          safekeepers: null,
          isDefault: false,
          createdAt: now,
          deletedAt: null,
          ...change.row,
        });
        return;
      case 'branch.markDeleted':
        for (const id of change.ids) {
          const found = branches.get(id);
          if (found) found.deletedAt = now;
        }
        return;
      case 'endpoint.insert':
        endpoints.set(change.row.id, {
          type: 'read_write',
          computeSize: '1',
          suspendTimeoutSeconds: 300,
          state: 'idle',
          podName: null,
          podIp: null,
          lastActiveAt: null,
          createdAt: now,
          deletedAt: null,
          ...change.row,
        });
        return;
      case 'endpoint.update': {
        const found = endpoints.get(change.id);
        if (found) Object.assign(found, change.set);
        return;
      }
      case 'endpoint.markDeleted':
        for (const id of change.ids) {
          const found = endpoints.get(id);
          if (found) found.deletedAt = now;
        }
        return;
      case 'role.insert':
        if (
          roles.some(
            (r) =>
              r.branchId === change.row.branchId && r.name === change.row.name,
          )
        ) {
          throw new Error('duplicate role');
        }
        roles.push({ createdAt: now, ...change.row });
        return;
      case 'role.setSecret': {
        const found = roles.find(
          (r) => r.branchId === change.branchId && r.name === change.name,
        );
        if (found) found.scramSecret = change.scramSecret;
        return;
      }
      case 'database.insert':
        if (
          databases.some(
            (d) =>
              d.branchId === change.row.branchId && d.name === change.row.name,
          )
        ) {
          throw new Error('duplicate database');
        }
        databases.push({
          dataApiEnabled: false,
          createdAt: now,
          ...change.row,
        });
        return;
      case 'database.delete': {
        const index = databases.findIndex(
          (d) => d.branchId === change.branchId && d.name === change.name,
        );
        if (index >= 0) databases.splice(index, 1);
        return;
      }
    }
  }

  const liveFilter = <T extends { deletedAt: Date | null }>(
    rows: T[],
    options?: { includeDeleted?: boolean },
  ): T[] => (options?.includeDeleted ? rows : rows.filter((r) => !r.deletedAt));

  return {
    projects,
    branches,
    endpoints,
    roles,
    databases,
    nodes,
    operations,
    setNow(value) {
      now = value;
    },

    async listProjects(scope) {
      return byCreatedAt([...projects.values()].filter((p) => owns(scope, p)));
    },
    async findProject(scope, projectId) {
      const found = projects.get(projectId);
      return owns(scope, found) ? (found as ProjectRow) : null;
    },
    async listBranches(scope, projectId) {
      if (!owns(scope, projects.get(projectId))) return [];
      return byCreatedAt(
        [...branches.values()].filter(
          (b) => b.projectId === projectId && !b.deletedAt,
        ),
      );
    },
    async findBranch(scope, projectId, branchId) {
      return scopedBranch(scope, projectId, branchId);
    },
    async listEndpoints(scope, projectId, filter) {
      if (!owns(scope, projects.get(projectId))) return [];
      const live = new Set(
        [...branches.values()]
          .filter((b) => b.projectId === projectId && !b.deletedAt)
          .map((b) => b.id),
      );
      return byCreatedAt(
        [...endpoints.values()].filter(
          (e) =>
            !e.deletedAt &&
            live.has(e.branchId) &&
            (!filter?.branchId || e.branchId === filter.branchId),
        ),
      );
    },
    async findEndpoint(scope, projectId, endpointId) {
      const found = endpoints.get(endpointId);
      if (!found || found.deletedAt) return null;
      return scopedBranch(scope, projectId, found.branchId) ? found : null;
    },
    async listRoles(scope, projectId, branchId) {
      if (!scopedBranch(scope, projectId, branchId)) return [];
      return byCreatedAt(roles.filter((r) => r.branchId === branchId));
    },
    async listDatabases(scope, projectId, branchId) {
      if (!scopedBranch(scope, projectId, branchId)) return [];
      return byCreatedAt(databases.filter((d) => d.branchId === branchId));
    },

    async commit(scope, input, changes) {
      const active = [...operations.values()].find(
        (o) =>
          o.consoleProjectId === scope.consoleProjectId &&
          (o.status === 'scheduling' || o.status === 'running'),
      );
      if (active) throw new ProjectBusyError(scope.consoleProjectId, active.id);
      // All-or-nothing, like the database transaction: apply to a copy first.
      const snapshot = {
        projects: structuredClone([...projects]),
        branches: structuredClone([...branches]),
        endpoints: structuredClone([...endpoints]),
        roles: structuredClone(roles),
        databases: structuredClone(databases),
      };
      try {
        for (const change of changes) apply(change);
      } catch (error) {
        projects.clear();
        for (const [k, v] of snapshot.projects) projects.set(k, v);
        branches.clear();
        for (const [k, v] of snapshot.branches) branches.set(k, v);
        endpoints.clear();
        for (const [k, v] of snapshot.endpoints) endpoints.set(k, v);
        roles.splice(0, roles.length, ...snapshot.roles);
        databases.splice(0, databases.length, ...snapshot.databases);
        throw error;
      }
      const record: OperationRecord = {
        id: newId('op'),
        consoleProjectId: scope.consoleProjectId,
        targetType: input.targetType,
        targetId: input.targetId,
        action: input.action,
        status: 'scheduling',
        failuresCount: 0,
        error: null,
        params: input.params ?? {},
        progress: { completedSteps: [], outputs: {} },
        createdAt: now,
        updatedAt: now,
        finishedAt: null,
      };
      operations.set(record.id, record);
      return record;
    },

    async getProject(projectId, options) {
      const found = projects.get(projectId);
      if (!found || (found.deletedAt && !options?.includeDeleted)) return null;
      return found;
    },
    async getBranch(branchId, options) {
      const found = branches.get(branchId);
      if (!found || (found.deletedAt && !options?.includeDeleted)) return null;
      return found;
    },
    async getEndpointContext(endpointId, options) {
      const found = endpoints.get(endpointId);
      const owningBranch = found && branches.get(found.branchId);
      const project = owningBranch && projects.get(owningBranch.projectId);
      if (!found || !owningBranch || !project) return null;
      if (
        !options?.includeDeleted &&
        (found.deletedAt || owningBranch.deletedAt || project.deletedAt)
      ) {
        return null;
      }
      return { endpoint: found, branch: owningBranch, project };
    },
    async listProjectBranches(projectId, options) {
      return byCreatedAt(
        liveFilter(
          [...branches.values()].filter((b) => b.projectId === projectId),
          options,
        ),
      );
    },
    async listBranchEndpoints(branchId, options) {
      return byCreatedAt(
        liveFilter(
          [...endpoints.values()].filter((e) => e.branchId === branchId),
          options,
        ),
      );
    },
    async listBranchRoles(branchId) {
      return byCreatedAt(roles.filter((r) => r.branchId === branchId));
    },
    async listBranchDatabases(branchId) {
      return byCreatedAt(databases.filter((d) => d.branchId === branchId));
    },
    async findProjectByTenant(tenantId) {
      return (
        [...projects.values()].find(
          (p) => p.tenantId === tenantId && !p.deletedAt,
        ) ?? null
      );
    },
    async findBranchByTimeline(tenantId, timelineId) {
      const project = [...projects.values()].find(
        (p) => p.tenantId === tenantId,
      );
      if (!project) return null;
      return (
        [...branches.values()].find(
          (b) =>
            b.projectId === project.id &&
            b.timelineId === timelineId &&
            !b.deletedAt,
        ) ?? null
      );
    },
    async listTenantEndpoints(tenantId, states) {
      const project = [...projects.values()].find(
        (p) => p.tenantId === tenantId,
      );
      if (!project) return [];
      const liveBranches = new Set(
        [...branches.values()]
          .filter((b) => b.projectId === project.id && !b.deletedAt)
          .map((b) => b.id),
      );
      return [...endpoints.values()].filter(
        (e) =>
          !e.deletedAt &&
          liveBranches.has(e.branchId) &&
          states.includes(e.state),
      );
    },
    async listEndpointsInState(states) {
      return [...endpoints.values()].filter(
        (e) => !e.deletedAt && states.includes(e.state),
      );
    },

    async claimEndpointState(endpointId, from, to, options) {
      const found = endpoints.get(endpointId);
      if (!found) return false;
      const stale =
        options?.staleBefore !== undefined &&
        found.state === to &&
        found.lastActiveAt !== null &&
        found.lastActiveAt < options.staleBefore;
      if (!from.includes(found.state) && !stale) return false;
      found.state = to;
      found.lastActiveAt = options?.now ?? now;
      return true;
    },
    async markEndpointRunning(endpointId, running) {
      const found = endpoints.get(endpointId);
      if (!found) return;
      found.state = 'running';
      found.podName = running.podName;
      found.podIp = running.podIp;
      found.lastActiveAt = running.at;
    },
    async markEndpointIdle(endpointId) {
      const found = endpoints.get(endpointId);
      if (!found) return;
      found.state = 'idle';
      found.podName = null;
      found.podIp = null;
    },
    async touchEndpoint(endpointId, at) {
      const found = endpoints.get(endpointId);
      if (found) found.lastActiveAt = at;
    },
    async updateBranchPlacement(branchId, placement) {
      const found = branches.get(branchId);
      if (!found) return false;
      let changed = false;
      if (
        placement.safekeepers &&
        (found.safekeepers === null ||
          placement.safekeepers.generation >= found.safekeepers.generation)
      ) {
        found.safekeepers = placement.safekeepers;
        changed = true;
      }
      if (placement.parentLsn && found.parentLsn === null) {
        found.parentLsn = placement.parentLsn;
        changed = true;
      }
      return changed;
    },

    async upsertNode(input) {
      const current = nodes.get(input.id);
      nodes.set(input.id, {
        id: input.id,
        name: input.name,
        tailscaleIp: input.tailscaleIp,
        zone: input.zone,
        roles: [...new Set([...(current?.roles ?? []), ...input.addRoles])],
        capacity: current?.capacity ?? {},
        registeredPageserver:
          input.registeredPageserver ?? current?.registeredPageserver ?? false,
        registeredSafekeepers: current?.registeredSafekeepers ?? false,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      });
    },
    async listNodes() {
      return [...nodes.values()].sort((a, b) => a.id - b.id);
    },
  };
}
