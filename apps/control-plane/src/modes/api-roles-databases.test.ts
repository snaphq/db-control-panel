import {
  databaseOperationResponseSchema,
  listDatabasesResponseSchema,
  listRolesResponseSchema,
  roleOperationResponseSchema,
} from '@repo/control-plane-contract';
import { describe, expect, it } from 'vitest';
import { buildScramSecret } from '../crypto/scram.js';
import { sealContext } from '../crypto/secretbox.js';
import {
  buildApi,
  call,
  createProject,
  finishOperations,
  testSecrets,
} from './api.fixture.js';

async function setup() {
  const api = buildApi();
  const created = await createProject(api);
  const base = `/projects/${created.projectId}/branches/${created.branchId}`;
  return { api, ...created, base };
}

const verifies = (password: string, secret: string) =>
  buildScramSecret(password, {
    salt: Buffer.from(secret.split('$')[1]?.split(':')[1] ?? '', 'base64'),
  }) === secret;

describe('roles', () => {
  it('lists role names without any secret', async () => {
    const t = await setup();
    const response = await call(t.api, 'GET', `${t.base}/roles`);
    const raw = await response.json();
    expect(listRolesResponseSchema.parse(raw).roles.map((r) => r.name)).toEqual(
      ['neondb_owner'],
    );
    expect(JSON.stringify(raw)).not.toMatch(/SCRAM|password/);
  });

  it('creates a role with a generated password and queues a spec push', async () => {
    const t = await setup();
    const response = await call(t.api, 'POST', `${t.base}/roles`, {
      body: { name: 'app_user' },
    });
    expect(response.status).toBe(202);
    const body = roleOperationResponseSchema.parse(await response.json());
    expect(body.role).toMatchObject({
      name: 'app_user',
      branch_id: t.branchId,
    });
    expect(body.role.password).toHaveLength(24);
    expect(body.operation.action).toBe('role.reset_password');
    expect(t.api.store.operations.get(body.operation.id)?.params).toEqual({
      branchId: t.branchId,
    });
    const stored = t.api.store.roles.find((r) => r.name === 'app_user');
    expect(verifies(body.role.password, stored?.scramSecret ?? '')).toBe(true);
  });

  it('rejects duplicate and reserved role names', async () => {
    const t = await setup();
    expect(
      (
        await call(t.api, 'POST', `${t.base}/roles`, {
          body: { name: 'neondb_owner' },
        })
      ).status,
    ).toBe(409);
    for (const name of [
      'postgres',
      'cloud_admin',
      'pg_write_all_data',
      'bad name',
    ]) {
      expect(
        (await call(t.api, 'POST', `${t.base}/roles`, { body: { name } }))
          .status,
      ).toBe(400);
    }
  });

  it('resets a password: a new secret that matches the new password only', async () => {
    const t = await setup();
    const before = t.api.store.roles[0]?.scramSecret ?? '';
    const response = await call(
      t.api,
      'POST',
      `${t.base}/roles/neondb_owner/reset_password`,
    );
    expect(response.status).toBe(202);
    const body = roleOperationResponseSchema.parse(await response.json());
    const after = t.api.store.roles[0]?.scramSecret ?? '';
    expect(after).not.toBe(before);
    expect(verifies(body.role.password, after)).toBe(true);
    expect(verifies(t.password, after)).toBe(false);
    expect(body.operation).toMatchObject({
      action: 'role.reset_password',
      target_id: 'neondb_owner',
    });
  });

  it('returns 404 for unknown roles and branches', async () => {
    const t = await setup();
    expect(
      (await call(t.api, 'POST', `${t.base}/roles/ghost/reset_password`))
        .status,
    ).toBe(404);
    const other = `/projects/${t.projectId}/branches/br_none`;
    expect((await call(t.api, 'GET', `${other}/roles`)).status).toBe(404);
    expect(
      (await call(t.api, 'POST', `${other}/roles`, { body: { name: 'x' } }))
        .status,
    ).toBe(404);
    expect(
      (await call(t.api, 'POST', `${other}/roles/x/reset_password`)).status,
    ).toBe(404);
  });
});

describe('databases', () => {
  it('lists databases', async () => {
    const t = await setup();
    const body = listDatabasesResponseSchema.parse(
      await (await call(t.api, 'GET', `${t.base}/databases`)).json(),
    );
    expect(body.databases).toMatchObject([
      { name: 'neondb', owner_name: 'neondb_owner', data_api_enabled: false },
    ]);
  });

  it('creates a database owned by an existing role', async () => {
    const t = await setup();
    const response = await call(t.api, 'POST', `${t.base}/databases`, {
      body: { name: 'analytics', owner_name: 'neondb_owner' },
    });
    expect(response.status).toBe(202);
    const body = databaseOperationResponseSchema.parse(await response.json());
    expect(body.database).toMatchObject({
      name: 'analytics',
      owner_name: 'neondb_owner',
    });
    expect(body.operation.action).toBe('database.create');
    expect(t.api.store.databases.map((d) => d.name)).toContain('analytics');
  });

  it('rejects unknown owners, duplicates and bad names', async () => {
    const t = await setup();
    const post = (body: unknown) =>
      call(t.api, 'POST', `${t.base}/databases`, { body });
    expect((await post({ name: 'x', owner_name: 'ghost' })).status).toBe(400);
    expect(
      (await post({ name: 'neondb', owner_name: 'neondb_owner' })).status,
    ).toBe(409);
    expect(
      (await post({ name: 'bad-name', owner_name: 'neondb_owner' })).status,
    ).toBe(400);
    expect(
      (await post({ name: 'postgres', owner_name: 'neondb_owner' })).status,
    ).toBe(400);
  });

  it('deletes by name and records what to drop', async () => {
    const t = await setup();
    const response = await call(t.api, 'DELETE', `${t.base}/databases/neondb`);
    expect(response.status).toBe(202);
    const body = databaseOperationResponseSchema.parse(await response.json());
    expect(body.operation.action).toBe('database.delete');
    expect(t.api.store.operations.get(body.operation.id)?.params).toEqual({
      branchId: t.branchId,
      name: 'neondb',
    });
    expect(t.api.store.databases).toEqual([]);
    finishOperations(t.api);
    expect(
      (await call(t.api, 'DELETE', `${t.base}/databases/neondb`)).status,
    ).toBe(404);
  });

  it('returns 404 for an unknown branch', async () => {
    const t = await setup();
    const other = `/projects/${t.projectId}/branches/br_none`;
    expect((await call(t.api, 'GET', `${other}/databases`)).status).toBe(404);
    expect((await call(t.api, 'DELETE', `${other}/databases/x`)).status).toBe(
      404,
    );
  });
});

describe('sealed role passwords', () => {
  const storedPassword = (
    t: Awaited<ReturnType<typeof setup>>,
    name: string,
  ) => {
    const row = t.api.store.roles.find((r) => r.name === name);
    return row?.passwordEnc
      ? testSecrets.open(row.passwordEnc, sealContext.rolePassword(name))
      : null;
  };

  it('keeps the owner password sealed so the Data API bootstrap can log in', async () => {
    const t = await setup();
    expect(storedPassword(t, 'neondb_owner')).toBe(t.password);
    const row = t.api.store.roles.find((r) => r.name === 'neondb_owner');
    expect(JSON.stringify(row)).not.toContain(t.password);
  });

  it('seals the password of a new role', async () => {
    const t = await setup();
    const body = roleOperationResponseSchema.parse(
      await (
        await call(t.api, 'POST', `${t.base}/roles`, { body: { name: 'app' } })
      ).json(),
    );
    expect(storedPassword(t, 'app')).toBe(body.role.password);
  });

  it('replaces the sealed password when it is reset', async () => {
    const t = await setup();
    const body = roleOperationResponseSchema.parse(
      await (
        await call(t.api, 'POST', `${t.base}/roles/neondb_owner/reset_password`)
      ).json(),
    );
    expect(body.role.password).not.toBe(t.password);
    expect(storedPassword(t, 'neondb_owner')).toBe(body.role.password);
  });

  it('lets a forked branch inherit the authenticator password', async () => {
    const t = await setup();
    const parent = t.api.store.branches.get(t.branchId);
    if (parent) parent.authenticatorPasswordEnc = 'sealed-authenticator';
    const response = await call(
      t.api,
      'POST',
      `/projects/${t.projectId}/branches`,
      {
        body: { name: 'dev' },
      },
    );
    const child = (await response.json()).branch.id as string;
    expect(t.api.store.branches.get(child)?.authenticatorPasswordEnc).toBe(
      'sealed-authenticator',
    );
  });
});
