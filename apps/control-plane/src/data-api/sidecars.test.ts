import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSecretBox, sealContext } from '../crypto/secretbox.js';
import { seedProject } from '../neon/fakes.js';
import { generateDataApiKey } from './keys.js';
import { createSidecarProvider } from './sidecars.js';

const secrets = createSecretBox(randomBytes(32));

async function setup() {
  const seeded = await seedProject();
  const { store } = seeded;
  const key = generateDataApiKey();
  const project = store.projects.get(seeded.projectId);
  const branch = store.branches.get(seeded.branchId);
  const database = store.databases[0];
  if (!project || !branch || !database) throw new Error('seed is incomplete');
  project.dataApiJwks = key.jwks;
  branch.authenticatorPasswordEnc = secrets.seal(
    'p@ss/w:rd',
    sealContext.authenticatorPassword,
  );
  database.dataApiEnabled = true;
  database.dataApiIndex = 2;
  const warnings: string[] = [];
  const provider = createSidecarProvider({
    store,
    secrets,
    logger: { warn: (m) => warnings.push(m) },
  });
  const context = async () => {
    const found = await store.getEndpointContext(seeded.endpointId);
    if (!found) throw new Error('no endpoint');
    return found;
  };
  return {
    ...seeded,
    key,
    project,
    branch,
    database,
    provider,
    context,
    warnings,
  };
}

describe('sidecar provider', () => {
  it('describes one sidecar per enabled database on its stored index', async () => {
    const t = await setup();
    const sidecars = await t.provider(await t.context());
    expect(sidecars).toEqual([
      {
        database: 'neondb',
        index: 2,
        dbUri: 'postgres://authenticator:p%40ss%2Fw%3Ard@127.0.0.1:5432/neondb',
        jwtSecret: JSON.stringify(t.key.jwks),
      },
    ]);
  });

  it('never points a sidecar at PgBouncer', async () => {
    const t = await setup();
    const [sidecar] = await t.provider(await t.context());
    expect(sidecar?.dbUri).toContain(':5432/');
    expect(sidecar?.dbUri).not.toContain('6432');
  });

  it('orders sidecars by index and skips disabled databases', async () => {
    const t = await setup();
    t.store.databases.push(
      { ...t.database, id: 'db_b', name: 'b_db', dataApiIndex: 0 },
      {
        ...t.database,
        id: 'db_c',
        name: 'c_db',
        dataApiEnabled: false,
        dataApiIndex: 1,
      },
    );
    const sidecars = await t.provider(await t.context());
    expect(sidecars.map((s) => [s.database, s.index])).toEqual([
      ['b_db', 0],
      ['neondb', 2],
    ]);
  });

  it('returns nothing when no database uses the Data API', async () => {
    const t = await setup();
    t.database.dataApiEnabled = false;
    expect(await t.provider(await t.context())).toEqual([]);
    expect(t.warnings).toEqual([]);
  });

  it("prefers the project's own JWKS over the platform key", async () => {
    const t = await setup();
    const custom = { keys: [{ kty: 'RSA', kid: 'mine', n: 'x', e: 'AQAB' }] };
    t.project.dataApiCustomJwks = custom;
    const [sidecar] = await t.provider(await t.context());
    expect(JSON.parse(sidecar?.jwtSecret ?? '{}')).toEqual(custom);
  });

  it('starts without PostgREST, and says why, when a credential is missing', async () => {
    const t = await setup();
    t.branch.authenticatorPasswordEnc = null;
    expect(await t.provider(await t.context())).toEqual([]);
    expect(t.warnings[0]).toMatch(/authenticator password is missing/);
    t.branch.authenticatorPasswordEnc = secrets.seal(
      'x',
      sealContext.authenticatorPassword,
    );
    t.project.dataApiJwks = null;
    expect(await t.provider(await t.context())).toEqual([]);
    expect(t.warnings[1]).toMatch(/JWKS is missing/);
  });
});
