import { describe, expect, it } from 'vitest';
import { newEndpointId, newId, newNeonId } from '../crypto/ids.js';
import { ProjectBusyError } from '../operations/repository.js';
import type { DesiredStateChange, NeonStore, Scope } from './store.js';

export interface StoreHarness {
  store: NeonStore;
  /** Settles an operation so its project accepts the next mutation. */
  finish(operationId: string): Promise<void>;
}

interface Seeded {
  scope: Scope;
  projectId: string;
  tenantId: string;
  branchId: string;
  timelineId: string;
  endpointId: string;
}

const unique = () => newId('proj').slice(5);

/**
 * Behaviour every {@link NeonStore} must have. Run against the in-memory store
 * always and against PostgreSQL when CONTROL_PLANE_TEST_DATABASE_URL is set, so
 * the fake the route tests rely on cannot drift from the real thing. Each test
 * uses fresh ids, so a shared database needs no cleanup.
 */
export function describeNeonStoreContract(
  name: string,
  setup: () => Promise<StoreHarness>,
  describeFn: typeof describe = describe,
): void {
  describeFn(`NeonStore contract: ${name}`, () => {
    async function seed(
      harness: StoreHarness,
      org = `org_${unique()}`,
    ): Promise<Seeded> {
      const scope: Scope = { orgId: org, consoleProjectId: `cp_${unique()}` };
      const projectId = newId('proj');
      const branchId = newId('br');
      const tenantId = newNeonId();
      const timelineId = newNeonId();
      const endpointId = newEndpointId();
      const op = await harness.store.commit(
        scope,
        {
          action: 'project.create',
          targetType: 'project',
          targetId: projectId,
        },
        [
          {
            kind: 'project.insert',
            row: {
              id: projectId,
              consoleProjectId: scope.consoleProjectId,
              consoleOrgId: org,
              name: 'demo',
              tenantId,
            },
          },
          {
            kind: 'branch.insert',
            row: {
              id: branchId,
              projectId,
              name: 'main',
              timelineId,
              isDefault: true,
            },
          },
          {
            kind: 'endpoint.insert',
            row: { id: endpointId, branchId },
          },
          {
            kind: 'role.insert',
            row: {
              id: newId('role'),
              branchId,
              name: 'owner',
              scramSecret: 'SCRAM-SHA-256$4096:a$b:c',
            },
          },
          {
            kind: 'database.insert',
            row: {
              id: newId('db'),
              branchId,
              name: 'neondb',
              ownerRole: 'owner',
            },
          },
        ],
      );
      await harness.finish(op.id);
      return { scope, projectId, tenantId, branchId, timelineId, endpointId };
    }

    it('reads what a committed operation wrote, inside the scope', async () => {
      const h = await setup();
      const s = await seed(h);
      expect((await h.store.listProjects(s.scope)).map((p) => p.id)).toEqual([
        s.projectId,
      ]);
      expect((await h.store.findProject(s.scope, s.projectId))?.name).toBe(
        'demo',
      );
      expect((await h.store.listBranches(s.scope, s.projectId))[0]?.id).toBe(
        s.branchId,
      );
      expect(
        (await h.store.findEndpoint(s.scope, s.projectId, s.endpointId))?.state,
      ).toBe('idle');
      expect(
        (await h.store.listRoles(s.scope, s.projectId, s.branchId)).map(
          (r) => r.name,
        ),
      ).toEqual(['owner']);
      expect(
        (await h.store.listDatabases(s.scope, s.projectId, s.branchId)).map(
          (d) => d.name,
        ),
      ).toEqual(['neondb']);
    });

    it('never shows another console project or organization anything', async () => {
      const h = await setup();
      const mine = await seed(h);
      const theirs = await seed(h);
      const sameOrgOtherProject: Scope = {
        orgId: mine.scope.orgId,
        consoleProjectId: theirs.scope.consoleProjectId,
      };
      const otherOrgSameProject: Scope = {
        orgId: theirs.scope.orgId,
        consoleProjectId: mine.scope.consoleProjectId,
      };

      for (const caller of [
        theirs.scope,
        sameOrgOtherProject,
        otherOrgSameProject,
      ]) {
        // Asking with the right ids but the wrong scope finds nothing.
        expect(await h.store.findProject(caller, mine.projectId)).toBeNull();
        expect(await h.store.listBranches(caller, mine.projectId)).toEqual([]);
        expect(
          await h.store.findBranch(caller, mine.projectId, mine.branchId),
        ).toBeNull();
        expect(await h.store.listEndpoints(caller, mine.projectId)).toEqual([]);
        expect(
          await h.store.findEndpoint(caller, mine.projectId, mine.endpointId),
        ).toBeNull();
        expect(
          await h.store.listRoles(caller, mine.projectId, mine.branchId),
        ).toEqual([]);
        expect(
          await h.store.listDatabases(caller, mine.projectId, mine.branchId),
        ).toEqual([]);
      }
      // A branch id only resolves under its own project id.
      expect(
        await h.store.findBranch(theirs.scope, theirs.projectId, mine.branchId),
      ).toBeNull();
      expect(
        await h.store.findEndpoint(
          theirs.scope,
          theirs.projectId,
          mine.endpointId,
        ),
      ).toBeNull();
      expect(
        await h.store.listRoles(theirs.scope, theirs.projectId, mine.branchId),
      ).toEqual([]);
    });

    it('rejects a second mutation while one is active and allows it after', async () => {
      const h = await setup();
      const s = await seed(h);
      const first = await h.store.commit(
        s.scope,
        {
          action: 'endpoint.update',
          targetType: 'endpoint',
          targetId: s.endpointId,
        },
        [
          {
            kind: 'endpoint.update',
            id: s.endpointId,
            set: { computeSize: '2' },
          },
        ],
      );
      await expect(
        h.store.commit(
          s.scope,
          {
            action: 'endpoint.update',
            targetType: 'endpoint',
            targetId: s.endpointId,
          },
          [],
        ),
      ).rejects.toBeInstanceOf(ProjectBusyError);
      await h.finish(first.id);
      await h.store.commit(
        s.scope,
        {
          action: 'endpoint.update',
          targetType: 'endpoint',
          targetId: s.endpointId,
        },
        [],
      );
    });

    it('applies nothing when a change in the batch fails', async () => {
      const h = await setup();
      const s = await seed(h);
      const duplicate: DesiredStateChange = {
        kind: 'role.insert',
        row: {
          id: newId('role'),
          branchId: s.branchId,
          name: 'owner',
          scramSecret: 'x',
        },
      };
      await expect(
        h.store.commit(
          s.scope,
          {
            action: 'role.reset_password',
            targetType: 'role',
            targetId: 'owner',
          },
          [
            {
              kind: 'database.insert',
              row: {
                id: newId('db'),
                branchId: s.branchId,
                name: 'second',
                ownerRole: 'owner',
              },
            },
            duplicate,
          ],
        ),
      ).rejects.toThrow();
      expect(
        (await h.store.listDatabases(s.scope, s.projectId, s.branchId)).map(
          (d) => d.name,
        ),
      ).toEqual(['neondb']);
      // The failed attempt must not have left an active operation behind.
      const retry = await h.store.commit(
        s.scope,
        {
          action: 'database.delete',
          targetType: 'database',
          targetId: 'neondb',
        },
        [{ kind: 'database.delete', branchId: s.branchId, name: 'neondb' }],
      );
      expect(retry.status).toBe('scheduling');
    });

    it('hides deleted rows from the console but not from the system view', async () => {
      const h = await setup();
      const s = await seed(h);
      const op = await h.store.commit(
        s.scope,
        {
          action: 'project.delete',
          targetType: 'project',
          targetId: s.projectId,
        },
        [
          { kind: 'endpoint.markDeleted', ids: [s.endpointId] },
          { kind: 'branch.markDeleted', ids: [s.branchId] },
          { kind: 'project.markDeleted', id: s.projectId },
        ],
      );
      await h.finish(op.id);
      expect(await h.store.findProject(s.scope, s.projectId)).toBeNull();
      expect(await h.store.listProjects(s.scope)).toEqual([]);
      expect(await h.store.getProject(s.projectId)).toBeNull();
      expect(
        (await h.store.getProject(s.projectId, { includeDeleted: true }))?.id,
      ).toBe(s.projectId);
      expect(await h.store.getEndpointContext(s.endpointId)).toBeNull();
      expect(
        (
          await h.store.getEndpointContext(s.endpointId, {
            includeDeleted: true,
          })
        )?.project.tenantId,
      ).toBe(s.tenantId);
      // The console project is free to host a new project again.
      const again = await h.store.commit(
        s.scope,
        {
          action: 'project.create',
          targetType: 'project',
          targetId: 'proj_again',
        },
        [
          {
            kind: 'project.insert',
            row: {
              id: newId('proj'),
              consoleProjectId: s.scope.consoleProjectId,
              consoleOrgId: s.scope.orgId,
              name: 'again',
              tenantId: newNeonId(),
            },
          },
        ],
      );
      expect(again.action).toBe('project.create');
    });

    it('updates and deletes desired state rows', async () => {
      const h = await setup();
      const s = await seed(h);
      const op = await h.store.commit(
        s.scope,
        {
          action: 'endpoint.update',
          targetType: 'endpoint',
          targetId: s.endpointId,
        },
        [
          {
            kind: 'endpoint.update',
            id: s.endpointId,
            set: { computeSize: '4', suspendTimeoutSeconds: 0 },
          },
          {
            kind: 'role.setSecret',
            branchId: s.branchId,
            name: 'owner',
            scramSecret: 'SCRAM-SHA-256$4096:n$e:w',
          },
          { kind: 'database.delete', branchId: s.branchId, name: 'neondb' },
        ],
      );
      await h.finish(op.id);
      const updated = await h.store.findEndpoint(
        s.scope,
        s.projectId,
        s.endpointId,
      );
      expect(updated).toMatchObject({
        computeSize: '4',
        suspendTimeoutSeconds: 0,
      });
      expect((await h.store.listBranchRoles(s.branchId))[0]?.scramSecret).toBe(
        'SCRAM-SHA-256$4096:n$e:w',
      );
      expect(await h.store.listBranchDatabases(s.branchId)).toEqual([]);
    });

    it('resolves system lookups by tenant, timeline and endpoint', async () => {
      const h = await setup();
      const s = await seed(h);
      expect((await h.store.findProjectByTenant(s.tenantId))?.id).toBe(
        s.projectId,
      );
      expect(
        (await h.store.findBranchByTimeline(s.tenantId, s.timelineId))?.id,
      ).toBe(s.branchId);
      expect(
        await h.store.findBranchByTimeline(s.tenantId, newNeonId()),
      ).toBeNull();
      const context = await h.store.getEndpointContext(s.endpointId);
      expect(context?.branch.id).toBe(s.branchId);
      expect(context?.project.id).toBe(s.projectId);
      expect(
        (await h.store.listBranchEndpoints(s.branchId)).map((e) => e.id),
      ).toEqual([s.endpointId]);
    });

    it('lets exactly one caller claim idle -> starting', async () => {
      const h = await setup();
      const s = await seed(h);
      const claims = await Promise.all([
        h.store.claimEndpointState(s.endpointId, ['idle'], 'starting'),
        h.store.claimEndpointState(s.endpointId, ['idle'], 'starting'),
        h.store.claimEndpointState(s.endpointId, ['idle'], 'starting'),
      ]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      expect(
        await h.store.claimEndpointState(s.endpointId, ['idle'], 'starting'),
      ).toBe(false);
      expect(
        (await h.store.listEndpointsInState(['starting'])).map((e) => e.id),
      ).toContain(s.endpointId);
    });

    it('takes over a stale starting claim but not a fresh one', async () => {
      const h = await setup();
      const s = await seed(h);
      const t0 = new Date('2026-02-01T00:00:00Z');
      await h.store.claimEndpointState(s.endpointId, ['idle'], 'starting', {
        now: t0,
      });
      const fresh = await h.store.claimEndpointState(
        s.endpointId,
        ['idle'],
        'starting',
        { staleBefore: new Date('2026-01-31T00:00:00Z') },
      );
      expect(fresh).toBe(false);
      const stale = await h.store.claimEndpointState(
        s.endpointId,
        ['idle'],
        'starting',
        {
          staleBefore: new Date('2026-02-02T00:00:00Z'),
          now: new Date('2026-02-02T00:00:01Z'),
        },
      );
      expect(stale).toBe(true);
    });

    it('records running and idle transitions', async () => {
      const h = await setup();
      const s = await seed(h);
      const at = new Date('2026-03-01T00:00:00Z');
      await h.store.claimEndpointState(s.endpointId, ['idle'], 'starting');
      await h.store.markEndpointRunning(s.endpointId, {
        podName: `compute-${s.endpointId}`,
        podIp: '10.42.0.7',
        at,
      });
      const running = await h.store.getEndpointContext(s.endpointId);
      expect(running?.endpoint).toMatchObject({
        state: 'running',
        podIp: '10.42.0.7',
        podName: `compute-${s.endpointId}`,
      });
      expect(running?.endpoint.lastActiveAt?.getTime()).toBe(at.getTime());
      const later = new Date('2026-03-01T00:05:00Z');
      await h.store.touchEndpoint(s.endpointId, later);
      expect(
        (
          await h.store.getEndpointContext(s.endpointId)
        )?.endpoint.lastActiveAt?.getTime(),
      ).toBe(later.getTime());
      await h.store.markEndpointIdle(s.endpointId);
      expect(
        (await h.store.getEndpointContext(s.endpointId))?.endpoint,
      ).toMatchObject({
        state: 'idle',
        podIp: null,
        podName: null,
      });
      expect(
        (await h.store.listTenantEndpoints(s.tenantId, ['running'])).length,
      ).toBe(0);
    });

    it('only moves safekeeper placement forward', async () => {
      const h = await setup();
      const s = await seed(h);
      const sk = (generation: number) => ({
        generation,
        safekeepers: [{ id: 1, hostname: 'safekeeper-0' }],
      });
      expect(
        await h.store.updateBranchPlacement(s.branchId, { safekeepers: sk(2) }),
      ).toBe(true);
      expect(
        await h.store.updateBranchPlacement(s.branchId, { safekeepers: sk(1) }),
      ).toBe(false);
      expect(
        await h.store.updateBranchPlacement(s.branchId, { safekeepers: sk(2) }),
      ).toBe(true);
      expect(
        (await h.store.getBranch(s.branchId))?.safekeepers?.generation,
      ).toBe(2);
      await h.store.updateBranchPlacement(s.branchId, {
        parentLsn: '0/16B5A50',
      });
      expect(
        await h.store.updateBranchPlacement(s.branchId, { parentLsn: '0/1' }),
      ).toBe(false);
      expect((await h.store.getBranch(s.branchId))?.parentLsn).toBe(
        '0/16B5A50',
      );
    });

    it('lists the tenants whose project has an operation in flight', async () => {
      const h = await setup();
      const busy = await seed(h);
      const idle = await seed(h);
      expect(await h.store.listTenantsWithActiveOperations()).not.toContain(
        busy.tenantId,
      );
      const running = await h.store.commit(
        busy.scope,
        {
          action: 'endpoint.update',
          targetType: 'endpoint',
          targetId: busy.endpointId,
        },
        [],
      );
      const during = await h.store.listTenantsWithActiveOperations();
      expect(during).toContain(busy.tenantId);
      expect(during).not.toContain(idle.tenantId);
      await h.finish(running.id);
      expect(await h.store.listTenantsWithActiveOperations()).not.toContain(
        busy.tenantId,
      );
    });

    it('merges node roles on upsert', async () => {
      const h = await setup();
      const id = 9000 + Math.floor(Math.random() * 900_000);
      await h.store.upsertNode({
        id,
        name: 'pageserver-1',
        tailscaleIp: '100.64.0.1',
        zone: 'az-1',
        addRoles: ['pageserver'],
        registeredPageserver: true,
      });
      await h.store.upsertNode({
        id,
        name: 'n1',
        tailscaleIp: '100.64.0.2',
        zone: 'az-1',
        addRoles: ['compute', 'pageserver'],
      });
      const found = (await h.store.listNodes()).find((n) => n.id === id);
      expect(found).toMatchObject({
        name: 'n1',
        tailscaleIp: '100.64.0.2',
        registeredPageserver: true,
      });
      expect([...(found?.roles ?? [])].sort()).toEqual([
        'compute',
        'pageserver',
      ]);
    });
  });
}
