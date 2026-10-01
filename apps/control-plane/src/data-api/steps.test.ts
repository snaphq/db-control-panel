import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildScramSecret } from '../crypto/scram.js';
import { createSecretBox, sealContext } from '../crypto/secretbox.js';
import type { OperationAction } from '../db/schema.js';
import { createComputeRuntime } from '../neon/compute-runtime.js';
import {
  createFakeClock,
  createFakeComputeCtl,
  createFakePods,
  createFakeStorcon,
  newTestSigner,
  seedProject,
} from '../neon/fakes.js';
import { createSpecService } from '../neon/spec-service.js';
import { createMemoryOperationStore } from '../operations/memory-store.js';
import { runOperation } from '../operations/runner.js';
import { StepRegistry } from '../operations/steps.js';
import { createFakeSql } from './fakes.js';
import { generateDataApiKey } from './keys.js';
import { createSidecarProvider } from './sidecars.js';
import { registerDataApiSteps } from './steps.js';

const secrets = createSecretBox(randomBytes(32));
const signer = newTestSigner();
const quiet = { info: () => {}, error: () => {} };
const OWNER_PASSWORD = 'owner-secret';
const AUTHENTICATOR_PASSWORD = 'authenticator-secret';

async function setup() {
  const seeded = await seedProject();
  const { store } = seeded;
  const pods = createFakePods();
  const computeCtl = createFakeComputeCtl();
  const storcon = createFakeStorcon();
  const sql = createFakeSql();
  const runtime = createComputeRuntime({
    store,
    pods,
    computeCtl,
    specs: createSpecService({ store, storcon, signer }),
    signer,
    sidecars: createSidecarProvider({
      store,
      secrets,
      logger: { warn: () => {} },
    }),
    config: {
      computeImage: 'compute',
      postgrestImage: 'postgrest',
      controlPlaneUri: 'http://glue',
    },
    clock: createFakeClock(),
    timings: { wakeTimeoutMs: 30_000, pollIntervalMs: 100 },
    logger: { warn: () => {} },
  });

  // What the API writes before it queues the operation.
  const project = store.projects.get(seeded.projectId);
  const branch = store.branches.get(seeded.branchId);
  const owner = store.roles[0];
  const database = store.databases[0];
  if (!project || !branch || !owner || !database) throw new Error('bad seed');
  owner.passwordEnc = secrets.seal(
    OWNER_PASSWORD,
    sealContext.rolePassword(owner.name),
  );
  branch.authenticatorPasswordEnc = secrets.seal(
    AUTHENTICATOR_PASSWORD,
    sealContext.authenticatorPassword,
  );
  project.dataApiJwks = generateDataApiKey().jwks;
  database.dataApiEnabled = true;
  database.dataApiIndex = 0;

  const registry = registerDataApiSteps(new StepRegistry(), {
    store,
    runtime,
    secrets,
    connect: sql.connect,
  });
  const operations = createMemoryOperationStore();
  let counter = 0;
  async function run(
    action: OperationAction,
    targetId: string,
    targetType = 'database',
    final = false,
  ) {
    const id = `op_${++counter}`;
    const record = operations.add(id, action);
    record.targetId = targetId;
    record.targetType = targetType;
    return { id, ...(await attempt(id, final)) };
  }
  async function attempt(id: string, final = false) {
    try {
      const outcome = await runOperation(id, {
        store: operations,
        registry,
        isFinalAttempt: final,
        logger: quiet,
      });
      return { outcome, thrown: null as unknown };
    } catch (thrown) {
      return { outcome: 'retry' as const, thrown };
    }
  }
  const containers = (podName: string) =>
    pods.pods.get(podName)?.spec?.containers.map((c) => c.name) ?? [];
  return {
    ...seeded,
    project,
    branch,
    owner,
    database,
    pods,
    sql,
    runtime,
    registry,
    run,
    attempt,
    containers,
    podName: `compute-${seeded.endpointId}`,
    record: (id: string) => operations.get(id),
  };
}

describe('data_api.enable', () => {
  it('starts an idle compute with the sidecar, then bootstraps as the owner over the pod IP', async () => {
    const t = await setup();
    const result = await t.run('data_api.enable', t.database.id);
    expect(result.outcome).toBe('finished');

    expect(t.pods.created).toEqual([t.podName]);
    expect(t.containers(t.podName)).toContain('postgrest-neondb');
    expect(t.sql.sessions).toHaveLength(1);
    const session = t.sql.sessions[0];
    expect(session?.target).toEqual({
      host: '10.42.0.10',
      port: 5432,
      database: 'neondb',
      user: 'neondb_owner',
      password: OWNER_PASSWORD,
    });
    expect(session?.closed).toBe(true);
    const scram = buildScramSecret(AUTHENTICATOR_PASSWORD, {
      salt: Buffer.from(
        (session?.statements[0] ?? '').match(
          /SCRAM-SHA-256\$4096:([^$]+)\$/,
        )?.[1] ?? '',
        'base64',
      ),
    });
    expect(session?.statements[0]).toContain(`PASSWORD '${scram}'`);
    expect(session?.statements.join('\n')).not.toContain(
      AUTHENTICATOR_PASSWORD,
    );

    const outputs = t.record(result.id).progress.outputs;
    expect(outputs['data_api.enable.bootstrap']).toEqual({
      schemaReload: 'event-trigger',
    });
    // The pod this operation started already had the sidecar: no restart.
    expect(outputs['data_api.enable.restart']).toEqual({ restarted: false });
    expect(t.pods.deleted).toEqual([]);
  });

  it('restarts a compute that was already running without the sidecar', async () => {
    const t = await setup();
    t.database.dataApiEnabled = false; // the compute starts as it was before enabling
    await t.runtime.wake(t.endpointId);
    expect(t.containers(t.podName)).not.toContain('postgrest-neondb');
    t.database.dataApiEnabled = true;

    const result = await t.run('data_api.enable', t.database.id);
    expect(result.outcome).toBe('finished');
    expect(t.pods.deleted).toContain(t.podName);
    expect(t.pods.created).toEqual([t.podName, t.podName]);
    expect(t.containers(t.podName)).toContain('postgrest-neondb');
    expect(
      t.record(result.id).progress.outputs['data_api.enable.restart'],
    ).toMatchObject({ restarted: true });
  });

  it('keeps going without event triggers when the owner may not create them', async () => {
    const t = await setup();
    t.sql.failStatement = { match: /CREATE EVENT TRIGGER/, code: '42501' };
    const result = await t.run('data_api.enable', t.database.id);
    expect(result.outcome).toBe('finished');
    expect(
      t.record(result.id).progress.outputs['data_api.enable.bootstrap'],
    ).toEqual({
      schemaReload: 'manual',
    });
  });

  it('retries when the compute cannot be reached yet', async () => {
    const t = await setup();
    t.sql.failConnect = new Error('connect ECONNREFUSED');
    const first = await t.run('data_api.enable', t.database.id);
    expect(first.outcome).toBe('retry');
    t.sql.failConnect = null;
    expect((await t.attempt(first.id)).outcome).toBe('finished');
    // The compute started once; the finished wake step was not repeated.
    expect(t.pods.created).toEqual([t.podName]);
  });

  it('fails for good when the owner rejects the stored password at login', async () => {
    const t = await setup();
    t.sql.failConnect = Object.assign(
      new Error('password authentication failed'),
      {
        code: '28P01',
      },
    );
    const result = await t.run('data_api.enable', t.database.id);
    expect(result.outcome).toBe('failed');
    expect(t.record(result.id).error).toMatch(/rejected the stored password/);
  });

  it('fails for good when the password is rejected mid-session too', async () => {
    const t = await setup();
    t.sql.failStatement = { match: /authenticator/, code: '28P01' };
    const result = await t.run('data_api.enable', t.database.id);
    expect(result.outcome).toBe('failed');
    expect(t.record(result.id).error).toMatch(/rejected the stored password/);
  });

  it('fails for good when no password is stored for the owner', async () => {
    const t = await setup();
    t.owner.passwordEnc = null;
    const result = await t.run('data_api.enable', t.database.id);
    expect(result.outcome).toBe('failed');
    expect(t.record(result.id).error).toMatch(/reset it and enable/);
    expect(t.sql.sessions).toHaveLength(0);
  });

  it('fails for good when the database or the writable endpoint is gone', async () => {
    const t = await setup();
    const missing = await t.run('data_api.enable', 'db_none');
    expect(missing.outcome).toBe('failed');
    const endpoint = t.store.endpoints.get(t.endpointId);
    if (endpoint) endpoint.type = 'read_only';
    const noWriter = await t.run('data_api.enable', t.database.id);
    expect(noWriter.outcome).toBe('failed');
    expect(t.record(noWriter.id).error).toMatch(/no read_write endpoint/);
  });

  it('is safe to run again on a database that is already set up', async () => {
    const t = await setup();
    await t.run('data_api.enable', t.database.id);
    const again = await t.run('data_api.enable', t.database.id);
    expect(again.outcome).toBe('finished');
    expect(t.sql.sessions).toHaveLength(2);
  });
});

describe('data_api.enable for a project (new JWKS)', () => {
  it('restarts running computes of branches that use the Data API', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    const result = await t.run('data_api.enable', t.projectId, 'project');
    expect(result.outcome).toBe('finished');
    expect(t.sql.sessions).toHaveLength(0); // no SQL: only the keys changed
    expect(t.pods.deleted).toContain(t.podName);
    expect(t.pods.created).toEqual([t.podName, t.podName]);
    expect(
      t.record(result.id).progress.outputs['data_api.enable.restart'],
    ).toEqual({
      restarted: [t.endpointId],
    });
  });

  it('leaves idle computes and branches without the Data API alone', async () => {
    const t = await setup();
    const idle = await t.run('data_api.enable', t.projectId, 'project');
    expect(idle.outcome).toBe('finished');
    expect(t.pods.created).toEqual([]);

    await t.runtime.wake(t.endpointId);
    t.database.dataApiEnabled = false;
    await t.run('data_api.enable', t.projectId, 'project');
    expect(t.pods.deleted).toEqual([]);
  });
});

describe('data_api.disable', () => {
  it('restarts the running compute so the pod loses the sidecar', async () => {
    const t = await setup();
    await t.runtime.wake(t.endpointId);
    expect(t.containers(t.podName)).toContain('postgrest-neondb');
    t.database.dataApiEnabled = false; // the API turned it off
    const result = await t.run('data_api.disable', t.database.id);
    expect(result.outcome).toBe('finished');
    expect(t.containers(t.podName)).not.toContain('postgrest-neondb');
    expect(
      t.record(result.id).progress.outputs['data_api.disable.restart'],
    ).toEqual({
      restarted: [t.endpointId],
    });
  });

  it('does nothing to an idle compute: its next start has no sidecar', async () => {
    const t = await setup();
    t.database.dataApiEnabled = false;
    const result = await t.run('data_api.disable', t.database.id);
    expect(result.outcome).toBe('finished');
    expect(t.pods.created).toEqual([]);
    expect(t.pods.deleted).toEqual([]);
  });

  it("keeps the other databases' sidecars", async () => {
    const t = await setup();
    t.store.databases.push({
      ...t.database,
      id: 'db_two',
      name: 'second',
      dataApiIndex: 1,
    });
    await t.runtime.wake(t.endpointId);
    t.database.dataApiEnabled = false;
    await t.run('data_api.disable', t.database.id);
    expect(t.containers(t.podName)).toContain('postgrest-second');
    expect(t.containers(t.podName)).not.toContain('postgrest-neondb');
  });
});
