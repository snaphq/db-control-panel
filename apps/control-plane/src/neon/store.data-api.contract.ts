import { describe, expect, it } from 'vitest';
import { newEndpointId, newId, newNeonId } from '../crypto/ids.js';
import type { StoreHarness } from './store.contract.js';
import type { Scope } from './store.js';

/**
 * Behaviour of the Data API and credential columns every {@link NeonStore} must
 * have: sealed passwords, the sidecar index, the authenticator password and the
 * project's JWT keys. Runs against memory always and PostgreSQL when available.
 */
export function describeDataApiStoreContract(
  name: string,
  setup: () => Promise<StoreHarness>,
  describeFn: typeof describe = describe,
): void {
  describeFn(`Data API columns: ${name}`, () => {
    async function seed(h: StoreHarness) {
      const unique = newId('proj').slice(5);
      const scope: Scope = {
        orgId: `org_${unique}`,
        consoleProjectId: `cp_${unique}`,
      };
      const ids = {
        projectId: newId('proj'),
        branchId: newId('br'),
        databaseId: newId('db'),
        endpointId: newEndpointId(),
      };
      const op = await h.store.commit(
        scope,
        {
          action: 'project.create',
          targetType: 'project',
          targetId: ids.projectId,
        },
        [
          {
            kind: 'project.insert',
            row: {
              id: ids.projectId,
              consoleProjectId: scope.consoleProjectId,
              consoleOrgId: scope.orgId,
              name: 'demo',
              tenantId: newNeonId(),
            },
          },
          {
            kind: 'branch.insert',
            row: {
              id: ids.branchId,
              projectId: ids.projectId,
              name: 'main',
              timelineId: newNeonId(),
              isDefault: true,
            },
          },
          {
            kind: 'endpoint.insert',
            row: { id: ids.endpointId, branchId: ids.branchId },
          },
          {
            kind: 'role.insert',
            row: {
              id: newId('role'),
              branchId: ids.branchId,
              name: 'owner',
              scramSecret: 'SCRAM-SHA-256$4096:a$b:c',
              passwordEnc: 'sealed-1',
            },
          },
          {
            kind: 'database.insert',
            row: {
              id: ids.databaseId,
              branchId: ids.branchId,
              name: 'app',
              ownerRole: 'owner',
            },
          },
        ],
      );
      await h.finish(op.id);
      return { scope, ...ids };
    }

    const commit = async (
      h: StoreHarness,
      s: Awaited<ReturnType<typeof seed>>,
      changes: Parameters<StoreHarness['store']['commit']>[2],
    ) => {
      const op = await h.store.commit(
        s.scope,
        {
          action: 'data_api.enable',
          targetType: 'database',
          targetId: s.databaseId,
        },
        changes,
      );
      await h.finish(op.id);
    };

    it('keeps the sealed password with the role and replaces it on reset', async () => {
      const h = await setup();
      const s = await seed(h);
      expect((await h.store.listBranchRoles(s.branchId))[0]?.passwordEnc).toBe(
        'sealed-1',
      );
      await commit(h, s, [
        {
          kind: 'role.setSecret',
          branchId: s.branchId,
          name: 'owner',
          scramSecret: 'SCRAM-SHA-256$4096:d$e:f',
          passwordEnc: 'sealed-2',
        },
      ]);
      const role = (await h.store.listBranchRoles(s.branchId))[0];
      expect(role).toMatchObject({
        scramSecret: 'SCRAM-SHA-256$4096:d$e:f',
        passwordEnc: 'sealed-2',
      });
    });

    it('leaves the sealed password alone when only the SCRAM secret changes', async () => {
      const h = await setup();
      const s = await seed(h);
      await commit(h, s, [
        {
          kind: 'role.setSecret',
          branchId: s.branchId,
          name: 'owner',
          scramSecret: 'SCRAM-SHA-256$4096:x$y:z',
        },
      ]);
      expect((await h.store.listBranchRoles(s.branchId))[0]?.passwordEnc).toBe(
        'sealed-1',
      );
    });

    it('enables the Data API with a stable sidecar index and finds the database by id', async () => {
      const h = await setup();
      const s = await seed(h);
      const before = await h.store.getDatabaseContext(s.databaseId);
      expect(before?.database).toMatchObject({
        dataApiEnabled: false,
        dataApiIndex: null,
      });
      await commit(h, s, [
        {
          kind: 'database.setDataApi',
          branchId: s.branchId,
          name: 'app',
          enabled: true,
          index: 3,
        },
      ]);
      await commit(h, s, [
        {
          kind: 'database.setDataApi',
          branchId: s.branchId,
          name: 'app',
          enabled: false,
        },
      ]);
      const after = await h.store.getDatabaseContext(s.databaseId);
      expect(after?.database).toMatchObject({
        dataApiEnabled: false,
        dataApiIndex: 3,
      });
      expect(after?.branch.id).toBe(s.branchId);
      expect(after?.project.id).toBe(s.projectId);
      expect(await h.store.getDatabaseContext('db_unknown')).toBeNull();
    });

    it('stores the authenticator password and the project keys', async () => {
      const h = await setup();
      const s = await seed(h);
      const jwks = { keys: [{ kty: 'EC', kid: 'k1' }] };
      await commit(h, s, [
        {
          kind: 'branch.setAuthenticator',
          branchId: s.branchId,
          passwordEnc: 'sealed-auth',
        },
        {
          kind: 'project.setDataApiPlatformKey',
          projectId: s.projectId,
          jwks,
          signingKeyEnc: 'sealed-key',
        },
      ]);
      const branch = await h.store.getBranch(s.branchId);
      const project = await h.store.getProject(s.projectId);
      expect(branch?.authenticatorPasswordEnc).toBe('sealed-auth');
      expect(project).toMatchObject({
        dataApiJwks: jwks,
        dataApiSigningKeyEnc: 'sealed-key',
        dataApiCustomJwks: null,
      });
    });

    it("sets and clears the project's own JWKS without touching the platform key", async () => {
      const h = await setup();
      const s = await seed(h);
      const custom = { keys: [{ kty: 'RSA', kid: 'mine' }] };
      await commit(h, s, [
        {
          kind: 'project.setDataApiPlatformKey',
          projectId: s.projectId,
          jwks: { keys: [{ kty: 'EC', kid: 'platform' }] },
          signingKeyEnc: 'sealed-key',
        },
        {
          kind: 'project.setDataApiCustomJwks',
          projectId: s.projectId,
          jwks: custom,
        },
      ]);
      expect(
        (await h.store.getProject(s.projectId))?.dataApiCustomJwks,
      ).toEqual(custom);
      await commit(h, s, [
        {
          kind: 'project.setDataApiCustomJwks',
          projectId: s.projectId,
          jwks: null,
        },
      ]);
      const project = await h.store.getProject(s.projectId);
      expect(project?.dataApiCustomJwks).toBeNull();
      expect(project?.dataApiSigningKeyEnc).toBe('sealed-key');
    });

    it("lets the Kubernetes sync replace a node's roles and merge capacity", async () => {
      const h = await setup();
      const id = 9_000 + Math.floor(Math.random() * 900);
      await h.store.upsertNode({
        id,
        name: 'n',
        tailscaleIp: '100.64.0.9',
        zone: 'az-1',
        addRoles: ['pageserver'],
        capacity: { ready: true },
      });
      await h.store.upsertNode({
        id,
        name: 'n',
        tailscaleIp: '100.64.0.9',
        zone: 'az-1',
        addRoles: [],
        roles: ['libsql', 'compute'],
        capacity: { libsqlMaxDatabases: 50 },
      });
      const node = (await h.store.listNodes()).find((n) => n.id === id);
      expect(node?.roles.sort()).toEqual(['compute', 'libsql']);
      expect(node?.capacity).toEqual({ ready: true, libsqlMaxDatabases: 50 });
    });
  });
}
