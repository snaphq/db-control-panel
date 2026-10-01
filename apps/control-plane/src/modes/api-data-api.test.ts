import { type JsonWebKey, createPublicKey, verify } from 'node:crypto';
import {
  dataApiJwksResponseSchema,
  dataApiToggleResponseSchema,
  dataApiTokenResponseSchema,
  setDataApiJwksResponseSchema,
} from '@repo/control-plane-contract';
import { describe, expect, it } from 'vitest';
import { sealContext } from '../crypto/secretbox.js';
import { generateDataApiKey } from '../data-api/keys.js';
import {
  alice,
  bob,
  buildApi,
  call,
  createProject,
  finishOperations,
  testSecrets,
} from './api.fixture.js';

async function setup() {
  const api = buildApi();
  const created = await createProject(api);
  const base = `/projects/${created.projectId}`;
  const dbPath = (name = 'neondb') =>
    `${base}/branches/${created.branchId}/databases/${name}/data_api`;
  return { api, ...created, base, dbPath };
}

type T = Awaited<ReturnType<typeof setup>>;

const enable = async (t: T, name?: string) => {
  const response = await call(t.api, 'PUT', t.dbPath(name));
  const body = await response.json();
  finishOperations(t.api);
  return { response, body };
};

describe('enable', () => {
  it('turns the Data API on and answers with the gateway URL', async () => {
    const t = await setup();
    const { response, body } = await enable(t);
    expect(response.status).toBe(202);
    const parsed = dataApiToggleResponseSchema.parse(body);
    expect(parsed.database).toMatchObject({
      name: 'neondb',
      data_api_enabled: true,
    });
    expect(parsed.data_api).toEqual({
      enabled: true,
      url: `https://${t.endpointId}.apirest.alloydb.net/neondb/rest/v1`,
    });
    expect(parsed.operation).toMatchObject({
      action: 'data_api.enable',
      target_type: 'database',
      target_id: parsed.database.id,
    });
    expect(t.api.store.operations.get(parsed.operation.id)?.params).toEqual({
      branchId: t.branchId,
    });
  });

  it('writes the desired state: flag, index, authenticator password and platform key', async () => {
    const t = await setup();
    await enable(t);
    const database = t.api.store.databases[0];
    expect(database).toMatchObject({ dataApiEnabled: true, dataApiIndex: 0 });
    const branch = t.api.store.branches.get(t.branchId);
    const password = testSecrets.open(
      branch?.authenticatorPasswordEnc ?? '',
      sealContext.authenticatorPassword,
    );
    expect(password).toMatch(/^[\w-]{24}$/);
    const project = t.api.store.projects.get(t.projectId);
    expect(project?.dataApiJwks?.keys).toHaveLength(1);
    expect(project?.dataApiCustomJwks).toBeNull();
    const privateKey = JSON.parse(
      testSecrets.open(
        project?.dataApiSigningKeyEnc ?? '',
        sealContext.dataApiSigningKey,
      ),
    );
    expect(privateKey.d).toBeTruthy();
    expect(JSON.stringify(project?.dataApiJwks)).not.toContain(privateKey.d);
  });

  it('gives a second database the next index and keeps the shared credentials', async () => {
    const t = await setup();
    await enable(t);
    const branch = t.api.store.branches.get(t.branchId);
    const authenticator = branch?.authenticatorPasswordEnc;
    const keyId = t.api.store.projects.get(t.projectId)?.dataApiJwks?.keys[0]
      ?.kid;
    await call(t.api, 'POST', `${t.base}/branches/${t.branchId}/databases`, {
      body: { name: 'analytics', owner_name: 'neondb_owner' },
    });
    finishOperations(t.api);
    const { response } = await enable(t, 'analytics');
    expect(response.status).toBe(202);
    expect(t.api.store.databases.map((d) => [d.name, d.dataApiIndex])).toEqual([
      ['neondb', 0],
      ['analytics', 1],
    ]);
    expect(branch?.authenticatorPasswordEnc).toBe(authenticator);
    expect(
      t.api.store.projects.get(t.projectId)?.dataApiJwks?.keys[0]?.kid,
    ).toBe(keyId);
  });

  it('never reuses an index, and a database keeps its own when re-enabled', async () => {
    const t = await setup();
    await enable(t);
    await call(t.api, 'DELETE', t.dbPath());
    finishOperations(t.api);
    expect(t.api.store.databases[0]).toMatchObject({
      dataApiEnabled: false,
      dataApiIndex: 0,
    });
    await call(t.api, 'POST', `${t.base}/branches/${t.branchId}/databases`, {
      body: { name: 'other', owner_name: 'neondb_owner' },
    });
    finishOperations(t.api);
    await enable(t, 'other');
    expect(
      t.api.store.databases.find((d) => d.name === 'other')?.dataApiIndex,
    ).toBe(1);
    await enable(t);
    expect(
      t.api.store.databases.find((d) => d.name === 'neondb')?.dataApiIndex,
    ).toBe(0);
  });

  it('is repeatable: enabling again queues another run and keeps the credentials', async () => {
    const t = await setup();
    await enable(t);
    const before = t.api.store.branches.get(
      t.branchId,
    )?.authenticatorPasswordEnc;
    const again = await enable(t);
    expect(again.response.status).toBe(202);
    expect(t.api.store.branches.get(t.branchId)?.authenticatorPasswordEnc).toBe(
      before,
    );
  });

  it('refuses when the owner password is not stored', async () => {
    const t = await setup();
    const owner = t.api.store.roles[0];
    if (owner) owner.passwordEnc = null;
    const { response, body } = await enable(t);
    expect(response.status).toBe(409);
    expect(body.error.message).toMatch(/reset_password/);
    expect(t.api.store.databases[0]?.dataApiEnabled).toBe(false);
  });

  it('refuses without a read_write endpoint', async () => {
    const t = await setup();
    const endpoint = t.api.store.endpoints.get(t.endpointId);
    if (endpoint) endpoint.type = 'read_only';
    expect((await enable(t)).response.status).toBe(409);
  });

  it('refuses two databases whose sidecars would share a container name', async () => {
    const t = await setup();
    for (const name of ['Shop', 'shop']) {
      await call(t.api, 'POST', `${t.base}/branches/${t.branchId}/databases`, {
        body: { name, owner_name: 'neondb_owner' },
      });
      finishOperations(t.api);
    }
    expect((await enable(t, 'Shop')).response.status).toBe(202);
    const clash = await enable(t, 'shop');
    expect(clash.response.status).toBe(409);
    expect(clash.body.error.message).toMatch(/container name/);
  });

  it('stops at 50 databases per branch', async () => {
    const t = await setup();
    const row = t.api.store.databases[0];
    if (!row) throw new Error('no database');
    for (let i = 0; i < 49; i++) {
      t.api.store.databases.push({
        ...row,
        id: `db_${i}`,
        name: `d${i}`,
        dataApiIndex: i + 1,
        dataApiEnabled: true,
      });
    }
    const response = await call(t.api, 'PUT', t.dbPath());
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toMatch(/at most 50/);
  });

  it('answers 404 for unknown resources and for other organizations or projects', async () => {
    const t = await setup();
    expect((await call(t.api, 'PUT', t.dbPath('nope'))).status).toBe(404);
    expect(
      (
        await call(
          t.api,
          'PUT',
          '/projects/proj_none/branches/br/databases/x/data_api',
        )
      ).status,
    ).toBe(404);
    for (const caller of [bob, { org: alice.org, project: 'other' }]) {
      expect((await call(t.api, 'PUT', t.dbPath(), { caller })).status).toBe(
        404,
      );
      expect((await call(t.api, 'DELETE', t.dbPath(), { caller })).status).toBe(
        404,
      );
    }
  });

  it('answers 423 while the project has an operation running', async () => {
    const t = await setup();
    await call(t.api, 'PUT', t.dbPath());
    expect((await call(t.api, 'PUT', t.dbPath())).status).toBe(423);
  });
});

describe('disable', () => {
  it('turns the flag off, keeps the index and queues data_api.disable', async () => {
    const t = await setup();
    await enable(t);
    const response = await call(t.api, 'DELETE', t.dbPath());
    expect(response.status).toBe(202);
    const body = dataApiToggleResponseSchema.parse(await response.json());
    expect(body.data_api).toEqual({ enabled: false, url: null });
    expect(body.database.data_api_enabled).toBe(false);
    expect(body.operation.action).toBe('data_api.disable');
    expect(t.api.store.databases[0]).toMatchObject({
      dataApiEnabled: false,
      dataApiIndex: 0,
    });
  });
});

describe('project JWKS', () => {
  const publicKey = {
    kty: 'EC',
    crv: 'P-256',
    x: 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU',
    y: 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0',
    kid: 'mine',
  };
  const put = (t: T, body: unknown) =>
    call(t.api, 'PUT', `${t.base}/data_api/jwks`, { body });

  it('has no keys before the Data API is first enabled, then the platform key', async () => {
    const t = await setup();
    const empty = dataApiJwksResponseSchema.parse(
      await (await call(t.api, 'GET', `${t.base}/data_api/jwks`)).json(),
    );
    expect(empty).toEqual({ jwks: null, source: null });
    await enable(t);
    const after = dataApiJwksResponseSchema.parse(
      await (await call(t.api, 'GET', `${t.base}/data_api/jwks`)).json(),
    );
    expect(after.source).toBe('platform');
    expect(after.jwks?.keys[0]).toMatchObject({ alg: 'ES256', kty: 'EC' });
    expect(after.jwks?.keys[0]).not.toHaveProperty('d');
  });

  it('replaces the keys and queues a project-wide restart', async () => {
    const t = await setup();
    await enable(t);
    const response = await put(t, { jwks: { keys: [publicKey] } });
    expect(response.status).toBe(202);
    const body = setDataApiJwksResponseSchema.parse(await response.json());
    expect(body.source).toBe('custom');
    expect(body.jwks?.keys[0]?.kid).toBe('mine');
    expect(body.operation).toMatchObject({
      action: 'data_api.enable',
      target_type: 'project',
      target_id: t.projectId,
    });
    finishOperations(t.api);
    const read = dataApiJwksResponseSchema.parse(
      await (await call(t.api, 'GET', `${t.base}/data_api/jwks`)).json(),
    );
    expect(read).toMatchObject({ source: 'custom' });
    // The platform key stays on file for when the project goes back to it.
    expect(t.api.store.projects.get(t.projectId)?.dataApiJwks).not.toBeNull();
  });

  it('returns to the platform key with null', async () => {
    const t = await setup();
    await enable(t);
    await put(t, { jwks: { keys: [publicKey] } });
    finishOperations(t.api);
    const response = await put(t, { jwks: null });
    expect(response.status).toBe(202);
    expect((await response.json()).source).toBe('platform');
  });

  it('accepts keys before the Data API is enabled', async () => {
    const t = await setup();
    const response = await put(t, { jwks: { keys: [publicKey] } });
    expect(response.status).toBe(202);
    expect((await response.json()).source).toBe('custom');
  });

  it('rejects private keys, empty sets, oversized sets and bad bodies with 400', async () => {
    const t = await setup();
    const cases: unknown[] = [
      { jwks: { keys: [{ ...publicKey, d: 'private' }] } },
      { jwks: { keys: [{ kty: 'oct', k: 'c2VjcmV0' }] } },
      { jwks: { keys: [] } },
      { jwks: { keys: [{ ...publicKey, x: 'x'.repeat(17_000) }] } },
      {},
      'nope',
    ];
    for (const body of cases) {
      expect((await put(t, body)).status).toBe(400);
    }
    expect(t.api.store.projects.get(t.projectId)?.dataApiCustomJwks).toBeNull();
  });

  it('is scoped to the caller', async () => {
    const t = await setup();
    for (const caller of [bob, { org: alice.org, project: 'other' }]) {
      expect(
        (await call(t.api, 'GET', `${t.base}/data_api/jwks`, { caller }))
          .status,
      ).toBe(404);
      expect(
        (
          await call(t.api, 'PUT', `${t.base}/data_api/jwks`, {
            caller,
            body: { jwks: null },
          })
        ).status,
      ).toBe(404);
    }
  });
});

describe('test tokens', () => {
  const mint = (t: T, body?: unknown) =>
    call(t.api, 'POST', `${t.base}/data_api/token`, { body });

  it('needs the platform key, created when the Data API is first enabled', async () => {
    const t = await setup();
    expect((await mint(t)).status).toBe(409);
  });

  it('mints an authenticated token that the published JWKS verifies', async () => {
    const t = await setup();
    await enable(t);
    const response = await mint(t, { sub: 'user-7', expires_in_seconds: 600 });
    expect(response.status).toBe(200);
    const body = dataApiTokenResponseSchema.parse(await response.json());
    expect(body.role).toBe('authenticated');
    const [header, payload, signature] = body.token.split('.') as [
      string,
      string,
      string,
    ];
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    expect(claims).toMatchObject({ role: 'authenticated', sub: 'user-7' });
    expect(new Date(body.expires_at).getTime() / 1000).toBe(claims.exp);

    const jwks = dataApiJwksResponseSchema.parse(
      await (await call(t.api, 'GET', `${t.base}/data_api/jwks`)).json(),
    );
    const key = createPublicKey({
      key: jwks.jwks?.keys[0] as JsonWebKey,
      format: 'jwk',
    });
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${payload}`),
        { key, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });

  it('defaults the body and can mint an anonymous token', async () => {
    const t = await setup();
    await enable(t);
    expect(
      dataApiTokenResponseSchema.parse(await (await mint(t)).json()).role,
    ).toBe('authenticated');
    const anon = dataApiTokenResponseSchema.parse(
      await (await mint(t, { role: 'anonymous' })).json(),
    );
    expect(anon.role).toBe('anonymous');
  });

  it('refuses other roles and long lifetimes', async () => {
    const t = await setup();
    await enable(t);
    expect((await mint(t, { role: 'authenticator' })).status).toBe(400);
    expect((await mint(t, { role: 'neondb_owner' })).status).toBe(400);
    expect((await mint(t, { expires_in_seconds: 999_999 })).status).toBe(400);
  });

  it('refuses while the project uses its own JWKS', async () => {
    const t = await setup();
    await enable(t);
    const project = t.api.store.projects.get(t.projectId);
    if (project) project.dataApiCustomJwks = generateDataApiKey().jwks;
    const response = await mint(t);
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toMatch(/own JWKS/);
  });

  it('is scoped to the caller', async () => {
    const t = await setup();
    await enable(t);
    expect(
      (
        await call(t.api, 'POST', `${t.base}/data_api/token`, {
          caller: bob,
          body: {},
        })
      ).status,
    ).toBe(404);
  });
});
