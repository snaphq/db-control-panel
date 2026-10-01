import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database, Transaction } from '../db/client.js';
import {
  type BranchSafekeepers,
  branch,
  database,
  endpoint,
  neonProject,
  node,
  role,
} from '../db/schema.js';
import type { OperationQueue } from '../operations/queue.js';
import { createOperation } from '../operations/repository.js';
import type {
  DesiredStateChange,
  EndpointContext,
  NeonStore,
  Scope,
} from './store.js';

/** Live project rows owned by the caller's organization and console project. */
const ownedProject = (scope: Scope): SQL | undefined =>
  and(
    eq(neonProject.consoleProjectId, scope.consoleProjectId),
    eq(neonProject.consoleOrgId, scope.orgId),
    isNull(neonProject.deletedAt),
  );

async function applyChange(
  tx: Transaction,
  change: DesiredStateChange,
): Promise<void> {
  switch (change.kind) {
    case 'project.insert':
      await tx.insert(neonProject).values(change.row);
      return;
    case 'project.markDeleted':
      await tx
        .update(neonProject)
        .set({ deletedAt: sql`now()` })
        .where(eq(neonProject.id, change.id));
      return;
    case 'branch.insert':
      await tx.insert(branch).values(change.row);
      return;
    case 'branch.markDeleted':
      if (change.ids.length === 0) return;
      await tx
        .update(branch)
        .set({ deletedAt: sql`now()` })
        .where(inArray(branch.id, change.ids));
      return;
    case 'endpoint.insert':
      await tx.insert(endpoint).values(change.row);
      return;
    case 'endpoint.update':
      await tx
        .update(endpoint)
        .set(change.set)
        .where(eq(endpoint.id, change.id));
      return;
    case 'endpoint.markDeleted':
      if (change.ids.length === 0) return;
      await tx
        .update(endpoint)
        .set({ deletedAt: sql`now()` })
        .where(inArray(endpoint.id, change.ids));
      return;
    case 'role.insert':
      await tx.insert(role).values(change.row);
      return;
    case 'role.setSecret':
      await tx
        .update(role)
        .set({ scramSecret: change.scramSecret })
        .where(
          and(eq(role.branchId, change.branchId), eq(role.name, change.name)),
        );
      return;
    case 'database.insert':
      await tx.insert(database).values(change.row);
      return;
    case 'database.delete':
      await tx
        .delete(database)
        .where(
          and(
            eq(database.branchId, change.branchId),
            eq(database.name, change.name),
          ),
        );
      return;
  }
}

export function createDrizzleNeonStore(
  db: Database,
  queue: OperationQueue,
): NeonStore {
  const liveBranch = (options?: { includeDeleted?: boolean }) =>
    options?.includeDeleted ? undefined : isNull(branch.deletedAt);
  const liveEndpoint = (options?: { includeDeleted?: boolean }) =>
    options?.includeDeleted ? undefined : isNull(endpoint.deletedAt);

  /** Branches of a project the caller owns; the join is what enforces the scope. */
  const scopedBranchIds = (scope: Scope, projectId: string) =>
    db
      .select({ id: branch.id })
      .from(branch)
      .innerJoin(neonProject, eq(branch.projectId, neonProject.id))
      .where(
        and(
          eq(branch.projectId, projectId),
          isNull(branch.deletedAt),
          ownedProject(scope),
        ),
      );

  return {
    async listProjects(scope) {
      return db
        .select()
        .from(neonProject)
        .where(ownedProject(scope))
        .orderBy(asc(neonProject.createdAt));
    },

    async findProject(scope, projectId) {
      const [row] = await db
        .select()
        .from(neonProject)
        .where(and(eq(neonProject.id, projectId), ownedProject(scope)));
      return row ?? null;
    },

    async listBranches(scope, projectId) {
      const rows = await db
        .select({ branch })
        .from(branch)
        .innerJoin(neonProject, eq(branch.projectId, neonProject.id))
        .where(
          and(
            eq(branch.projectId, projectId),
            isNull(branch.deletedAt),
            ownedProject(scope),
          ),
        )
        .orderBy(asc(branch.createdAt));
      return rows.map((row) => row.branch);
    },

    async findBranch(scope, projectId, branchId) {
      const [row] = await db
        .select({ branch })
        .from(branch)
        .innerJoin(neonProject, eq(branch.projectId, neonProject.id))
        .where(
          and(
            eq(branch.id, branchId),
            eq(branch.projectId, projectId),
            isNull(branch.deletedAt),
            ownedProject(scope),
          ),
        );
      return row?.branch ?? null;
    },

    async listEndpoints(scope, projectId, filter) {
      const rows = await db
        .select({ endpoint })
        .from(endpoint)
        .innerJoin(branch, eq(endpoint.branchId, branch.id))
        .innerJoin(neonProject, eq(branch.projectId, neonProject.id))
        .where(
          and(
            eq(branch.projectId, projectId),
            filter?.branchId
              ? eq(endpoint.branchId, filter.branchId)
              : undefined,
            isNull(endpoint.deletedAt),
            isNull(branch.deletedAt),
            ownedProject(scope),
          ),
        )
        .orderBy(asc(endpoint.createdAt));
      return rows.map((row) => row.endpoint);
    },

    async findEndpoint(scope, projectId, endpointId) {
      const [row] = await db
        .select({ endpoint })
        .from(endpoint)
        .innerJoin(branch, eq(endpoint.branchId, branch.id))
        .innerJoin(neonProject, eq(branch.projectId, neonProject.id))
        .where(
          and(
            eq(endpoint.id, endpointId),
            eq(branch.projectId, projectId),
            isNull(endpoint.deletedAt),
            isNull(branch.deletedAt),
            ownedProject(scope),
          ),
        );
      return row?.endpoint ?? null;
    },

    async listRoles(scope, projectId, branchId) {
      return db
        .select()
        .from(role)
        .where(
          and(
            eq(role.branchId, branchId),
            inArray(role.branchId, scopedBranchIds(scope, projectId)),
          ),
        )
        .orderBy(asc(role.createdAt), asc(role.name));
    },

    async listDatabases(scope, projectId, branchId) {
      return db
        .select()
        .from(database)
        .where(
          and(
            eq(database.branchId, branchId),
            inArray(database.branchId, scopedBranchIds(scope, projectId)),
          ),
        )
        .orderBy(asc(database.createdAt), asc(database.name));
    },

    commit(scope, input, changes) {
      return createOperation(db, queue, {
        consoleProjectId: scope.consoleProjectId,
        targetType: input.targetType,
        targetId: input.targetId,
        action: input.action,
        params: input.params,
        applyDesiredState: async (tx) => {
          for (const change of changes) await applyChange(tx, change);
        },
      });
    },

    async getProject(projectId, options) {
      const [row] = await db
        .select()
        .from(neonProject)
        .where(
          and(
            eq(neonProject.id, projectId),
            options?.includeDeleted ? undefined : isNull(neonProject.deletedAt),
          ),
        );
      return row ?? null;
    },

    async getBranch(branchId, options) {
      const [row] = await db
        .select()
        .from(branch)
        .where(and(eq(branch.id, branchId), liveBranch(options)));
      return row ?? null;
    },

    async getEndpointContext(endpointId, options) {
      const [row] = await db
        .select({ endpoint, branch, project: neonProject })
        .from(endpoint)
        .innerJoin(branch, eq(endpoint.branchId, branch.id))
        .innerJoin(neonProject, eq(branch.projectId, neonProject.id))
        .where(
          and(
            eq(endpoint.id, endpointId),
            options?.includeDeleted
              ? undefined
              : and(
                  isNull(endpoint.deletedAt),
                  isNull(branch.deletedAt),
                  isNull(neonProject.deletedAt),
                ),
          ),
        );
      return (row as EndpointContext | undefined) ?? null;
    },

    async listProjectBranches(projectId, options) {
      return db
        .select()
        .from(branch)
        .where(and(eq(branch.projectId, projectId), liveBranch(options)))
        .orderBy(asc(branch.createdAt));
    },

    async listBranchEndpoints(branchId, options) {
      return db
        .select()
        .from(endpoint)
        .where(and(eq(endpoint.branchId, branchId), liveEndpoint(options)))
        .orderBy(asc(endpoint.createdAt));
    },

    async listBranchRoles(branchId) {
      return db
        .select()
        .from(role)
        .where(eq(role.branchId, branchId))
        .orderBy(asc(role.createdAt), asc(role.name));
    },

    async listBranchDatabases(branchId) {
      return db
        .select()
        .from(database)
        .where(eq(database.branchId, branchId))
        .orderBy(asc(database.createdAt), asc(database.name));
    },

    async findProjectByTenant(tenantId) {
      const [row] = await db
        .select()
        .from(neonProject)
        .where(
          and(
            eq(neonProject.tenantId, tenantId),
            isNull(neonProject.deletedAt),
          ),
        );
      return row ?? null;
    },

    async findBranchByTimeline(tenantId, timelineId) {
      const [row] = await db
        .select({ branch })
        .from(branch)
        .innerJoin(neonProject, eq(branch.projectId, neonProject.id))
        .where(
          and(
            eq(neonProject.tenantId, tenantId),
            eq(branch.timelineId, timelineId),
            isNull(branch.deletedAt),
          ),
        );
      return row?.branch ?? null;
    },

    async listTenantEndpoints(tenantId, states) {
      if (states.length === 0) return [];
      const rows = await db
        .select({ endpoint })
        .from(endpoint)
        .innerJoin(branch, eq(endpoint.branchId, branch.id))
        .innerJoin(neonProject, eq(branch.projectId, neonProject.id))
        .where(
          and(
            eq(neonProject.tenantId, tenantId),
            inArray(endpoint.state, states),
            isNull(endpoint.deletedAt),
            isNull(branch.deletedAt),
          ),
        );
      return rows.map((row) => row.endpoint);
    },

    async listEndpointsInState(states) {
      if (states.length === 0) return [];
      return db
        .select()
        .from(endpoint)
        .where(
          and(inArray(endpoint.state, states), isNull(endpoint.deletedAt)),
        );
    },

    async claimEndpointState(endpointId, from, to, options) {
      const now = options?.now ?? new Date();
      const claimable = options?.staleBefore
        ? or(
            inArray(endpoint.state, from),
            and(
              eq(endpoint.state, to),
              lt(endpoint.lastActiveAt, options.staleBefore),
            ),
          )
        : inArray(endpoint.state, from);
      const claimed = await db
        .update(endpoint)
        // A claim counts as activity: it is the timestamp a stale `starting`
        // claim is judged by, and it keeps idle-suspend from racing the start.
        .set({ state: to, lastActiveAt: now })
        .where(and(eq(endpoint.id, endpointId), claimable))
        .returning({ id: endpoint.id });
      return claimed.length > 0;
    },

    async markEndpointRunning(endpointId, running) {
      await db
        .update(endpoint)
        .set({
          state: 'running',
          podName: running.podName,
          podIp: running.podIp,
          lastActiveAt: running.at,
        })
        .where(eq(endpoint.id, endpointId));
    },

    async markEndpointIdle(endpointId) {
      await db
        .update(endpoint)
        .set({ state: 'idle', podName: null, podIp: null })
        .where(eq(endpoint.id, endpointId));
    },

    async touchEndpoint(endpointId, at) {
      await db
        .update(endpoint)
        .set({ lastActiveAt: at })
        .where(eq(endpoint.id, endpointId));
    },

    async updateBranchPlacement(branchId, placement) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(branch)
          .where(eq(branch.id, branchId))
          .for('update');
        if (!current) return false;
        const set: {
          safekeepers?: BranchSafekeepers;
          parentLsn?: string;
        } = {};
        if (
          placement.safekeepers &&
          (current.safekeepers === null ||
            placement.safekeepers.generation >= current.safekeepers.generation)
        ) {
          set.safekeepers = placement.safekeepers;
        }
        if (placement.parentLsn && current.parentLsn === null) {
          set.parentLsn = placement.parentLsn;
        }
        if (Object.keys(set).length === 0) return false;
        await tx.update(branch).set(set).where(eq(branch.id, branchId));
        return true;
      });
    },

    async upsertNode(input) {
      await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(node)
          .where(eq(node.id, input.id))
          .for('update');
        const roles = [
          ...new Set([...(current?.roles ?? []), ...input.addRoles]),
        ];
        await tx
          .insert(node)
          .values({
            id: input.id,
            name: input.name,
            tailscaleIp: input.tailscaleIp,
            zone: input.zone,
            roles,
            registeredPageserver: input.registeredPageserver ?? false,
          })
          .onConflictDoUpdate({
            target: node.id,
            set: {
              name: input.name,
              tailscaleIp: input.tailscaleIp,
              zone: input.zone,
              roles,
              registeredPageserver:
                input.registeredPageserver ??
                current?.registeredPageserver ??
                false,
              updatedAt: sql`now()`,
            },
          });
      });
    },

    async listNodes() {
      return db.select().from(node).orderBy(asc(node.id));
    },
  };
}
