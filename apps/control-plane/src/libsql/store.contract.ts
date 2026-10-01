import { describe, expect, it } from 'vitest';
import { newId } from '../crypto/ids.js';
import type { NeonStore, Scope } from '../neon/store.js';
import { ProjectBusyError } from '../operations/repository.js';
import type { LibsqlStore } from './store.js';

export interface LibsqlHarness {
  libsql: LibsqlStore;
  /** Same database as `libsql`: nodes are rows both stores see. */
  neon: NeonStore;
  finish(operationId: string): Promise<void>;
}

/**
 * Behaviour every {@link LibsqlStore} must have. Run against memory always and
 * PostgreSQL when CONTROL_PLANE_TEST_DATABASE_URL is set.
 */
export function describeLibsqlStoreContract(
  name: string,
  setup: () => Promise<LibsqlHarness>,
  describeFn: typeof describe = describe,
): void {
  describeFn(`LibsqlStore contract: ${name}`, () => {
    const unique = () => newId('proj').slice(5);

    async function node(h: LibsqlHarness): Promise<number> {
      const id = 20_000 + Math.floor(Math.random() * 9_000);
      await h.neon.upsertNode({
        id,
        name: `n${id}`,
        tailscaleIp: '100.64.1.1',
        zone: 'az-1',
        addRoles: ['libsql'],
      });
      return id;
    }

    async function create(
      h: LibsqlHarness,
      scope: Scope,
      nodeId: number,
      namespace = `db-${unique()}`,
    ) {
      const id = newId('ldb');
      const op = await h.libsql.commit(
        scope,
        {
          action: 'libsql.create',
          targetType: 'libsql_database',
          targetId: id,
        },
        [
          {
            kind: 'libsql.insert',
            row: {
              id,
              consoleProjectId: scope.consoleProjectId,
              consoleOrgId: scope.orgId,
              name: namespace,
              namespace,
              nodeId,
            },
          },
        ],
      );
      await h.finish(op.id);
      return { id, namespace };
    }

    const scopeOf = (): Scope => ({
      orgId: `org_${unique()}`,
      consoleProjectId: `cp_${unique()}`,
    });

    it('creates a database in state creating and reads it back', async () => {
      const h = await setup();
      const scope = scopeOf();
      const nodeId = await node(h);
      const { id, namespace } = await create(h, scope, nodeId);
      const row = await h.libsql.find(scope, id);
      expect(row).toMatchObject({
        id,
        namespace,
        nodeId,
        state: 'creating',
        sizeLimitBytes: null,
        deletedAt: null,
      });
      expect((await h.libsql.list(scope)).map((r) => r.id)).toEqual([id]);
      expect((await h.libsql.get(id))?.id).toBe(id);
    });

    it('never shows another organization or console project a database', async () => {
      const h = await setup();
      const mine = scopeOf();
      const nodeId = await node(h);
      const { id } = await create(h, mine, nodeId);
      const otherOrg: Scope = { ...mine, orgId: `org_${unique()}` };
      const otherProject: Scope = {
        ...mine,
        consoleProjectId: `cp_${unique()}`,
      };
      for (const scope of [otherOrg, otherProject]) {
        expect(await h.libsql.find(scope, id)).toBeNull();
        expect(await h.libsql.list(scope)).toEqual([]);
      }
    });

    it('moves a database through states', async () => {
      const h = await setup();
      const scope = scopeOf();
      const { id } = await create(h, scope, await node(h));
      await h.libsql.setState(id, 'active');
      expect((await h.libsql.find(scope, id))?.state).toBe('active');
    });

    it('hides a deleted database from the console but not from the worker', async () => {
      const h = await setup();
      const scope = scopeOf();
      const { id, namespace } = await create(h, scope, await node(h));
      const op = await h.libsql.commit(
        scope,
        {
          action: 'libsql.delete',
          targetType: 'libsql_database',
          targetId: id,
        },
        [{ kind: 'libsql.markDeleted', id }],
      );
      await h.finish(op.id);
      expect(await h.libsql.find(scope, id)).toBeNull();
      expect(await h.libsql.list(scope)).toEqual([]);
      expect(await h.libsql.get(id)).toBeNull();
      expect(await h.libsql.get(id, { includeDeleted: true })).toMatchObject({
        state: 'deleting',
      });
      expect(await h.libsql.findByNamespace(namespace)).toBeNull();
    });

    it('finds a live database by namespace across organizations and frees it on delete', async () => {
      const h = await setup();
      const scope = scopeOf();
      const nodeId = await node(h);
      const { id, namespace } = await create(h, scope, nodeId);
      expect((await h.libsql.findByNamespace(namespace))?.id).toBe(id);
      const op = await h.libsql.commit(
        scope,
        {
          action: 'libsql.delete',
          targetType: 'libsql_database',
          targetId: id,
        },
        [{ kind: 'libsql.markDeleted', id }],
      );
      await h.finish(op.id);
      // The namespace can be used again once the old row is deleted.
      await create(h, scopeOf(), nodeId, namespace);
      expect(await h.libsql.findByNamespace(namespace)).not.toBeNull();
    });

    it('rejects a second live database with the same namespace', async () => {
      const h = await setup();
      const nodeId = await node(h);
      const first = await create(h, scopeOf(), nodeId);
      await expect(
        create(h, scopeOf(), nodeId, first.namespace),
      ).rejects.toThrow();
    });

    it('counts live databases per node', async () => {
      const h = await setup();
      const a = await node(h);
      const b = (await node(h)) + 1;
      await h.neon.upsertNode({
        id: b,
        name: `n${b}`,
        tailscaleIp: '100.64.1.2',
        zone: 'az-1',
        addRoles: ['libsql'],
      });
      await create(h, scopeOf(), a);
      await create(h, scopeOf(), a);
      await create(h, scopeOf(), b);
      const counts = await h.libsql.countByNode();
      expect(counts.get(a)).toBeGreaterThanOrEqual(2);
      expect(counts.get(b)).toBeGreaterThanOrEqual(1);
      expect((await h.libsql.getNode(a))?.tailscaleIp).toBe('100.64.1.1');
      expect(await h.libsql.getNode(1)).toBeNull();
    });

    it('holds one operation lock per console project', async () => {
      const h = await setup();
      const scope = scopeOf();
      const nodeId = await node(h);
      const id = newId('ldb');
      await h.libsql.commit(
        scope,
        {
          action: 'libsql.create',
          targetType: 'libsql_database',
          targetId: id,
        },
        [
          {
            kind: 'libsql.insert',
            row: {
              id,
              consoleProjectId: scope.consoleProjectId,
              consoleOrgId: scope.orgId,
              name: 'a',
              namespace: `a-${unique()}`,
              nodeId,
            },
          },
        ],
      );
      await expect(
        h.libsql.commit(
          scope,
          {
            action: 'libsql.create',
            targetType: 'libsql_database',
            targetId: 'x',
          },
          [],
        ),
      ).rejects.toBeInstanceOf(ProjectBusyError);
    });
  });
}
