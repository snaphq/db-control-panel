import { describe, expect, it } from 'vitest';
import {
  type ComputePodInput,
  buildComputePod,
  computePodName,
  postgrestApiPort,
  postgrestContainerName,
} from './compute-pod.js';

const input: ComputePodInput = {
  endpointId: 'ep-calm-moon-abcd1234',
  projectId: 'proj_1',
  branchId: 'br_1',
  computeSize: '0.5',
  specToken: 'spec.token.value',
  controlPlaneUri: 'http://neon-glue.alloydb-system:8080',
  computeImage: 'ghcr.io/snaphq/neon-compute-v17:abc',
  postgrestImage: 'ghcr.io/snaphq/postgrest:abc',
};

const container = (pod: ReturnType<typeof buildComputePod>, name: string) =>
  pod.spec?.containers.find((c) => c.name === name);

describe('buildComputePod', () => {
  const pod = buildComputePod(input);

  it('is named after the endpoint in neon-compute with the lookup labels', () => {
    expect(computePodName(input.endpointId)).toBe(
      'compute-ep-calm-moon-abcd1234',
    );
    expect(pod.metadata).toMatchObject({
      name: 'compute-ep-calm-moon-abcd1234',
      namespace: 'neon-compute',
      labels: {
        'alloydb.net/endpoint': 'ep-calm-moon-abcd1234',
        'alloydb.net/project': 'proj_1',
        'alloydb.net/branch': 'br_1',
      },
    });
  });

  it('runs compute_ctl with the documented arguments', () => {
    const compute = container(pod, 'compute');
    expect(compute?.command).toEqual(['/usr/local/bin/compute_ctl']);
    expect(compute?.args).toEqual([
      '--control-plane-uri',
      'http://neon-glue.alloydb-system:8080',
      '--compute-id',
      'ep-calm-moon-abcd1234',
      '--pgdata',
      '/var/db/postgres/compute',
      '--pgbin',
      '/usr/local/bin/postgres',
      '--connstr',
      'postgresql://cloud_admin@127.0.0.1:5432/postgres',
    ]);
    expect(compute?.ports?.map((p) => p.containerPort)).toEqual([5432, 3080]);
  });

  it('passes the spec token as NEON_CONTROL_PLANE_TOKEN', () => {
    expect(container(pod, 'compute')?.env).toEqual([
      { name: 'NEON_CONTROL_PLANE_TOKEN', value: 'spec.token.value' },
    ]);
  });

  it('sizes the compute container from the compute size', () => {
    expect(container(pod, 'compute')?.resources).toEqual({
      requests: { cpu: '500m', memory: '2048Mi' },
      limits: { cpu: '500m', memory: '2048Mi' },
    });
  });

  it('runs PgBouncer on 6432 from the same image', () => {
    const bouncer = container(pod, 'pgbouncer');
    expect(bouncer?.image).toBe(input.computeImage);
    expect(bouncer?.command).toEqual(['/usr/local/bin/pgbouncer']);
    expect(bouncer?.args).toEqual(['/etc/pgbouncer.ini']);
    expect(bouncer?.ports?.[0]?.containerPort).toBe(6432);
  });

  it('is scheduled on compute nodes, spread by host, and never restarted in place', () => {
    expect(pod.spec?.nodeSelector).toEqual({ 'alloydb.net/compute': 'true' });
    expect(pod.spec?.topologySpreadConstraints).toEqual([
      expect.objectContaining({
        topologyKey: 'kubernetes.io/hostname',
        maxSkew: 1,
      }),
    ]);
    expect(pod.spec?.restartPolicy).toBe('Never');
    expect(pod.spec?.imagePullSecrets).toEqual([{ name: 'ghcr-pull' }]);
    expect(pod.spec?.automountServiceAccountToken).toBe(false);
  });

  it('has no Data API containers by default', () => {
    expect(pod.spec?.containers.map((c) => c.name)).toEqual([
      'compute',
      'pgbouncer',
    ]);
  });

  it('adds one PostgREST sidecar per Data API database on its own ports', () => {
    const withApi = buildComputePod({
      ...input,
      sidecars: [
        {
          database: 'neondb',
          index: 0,
          dbUri: 'postgres://a',
          jwtSecret: '{"keys":[]}',
        },
        {
          database: 'app_db',
          index: 1,
          dbUri: 'postgres://b',
          jwtSecret: '{"keys":[]}',
        },
      ],
    });
    expect(withApi.spec?.containers.map((c) => c.name)).toEqual([
      'compute',
      'pgbouncer',
      'postgrest-neondb',
      'postgrest-app-db',
    ]);
    const second = container(withApi, 'postgrest-app-db');
    expect(second?.image).toBe(input.postgrestImage);
    expect(second?.ports?.map((p) => p.containerPort)).toEqual([3001, 3101]);
    const env = Object.fromEntries(
      (second?.env ?? []).map((e) => [e.name, e.value]),
    );
    expect(env).toMatchObject({
      PGRST_DB_URI: 'postgres://b',
      PGRST_DB_ANON_ROLE: 'anonymous',
      PGRST_SERVER_PORT: '3001',
      PGRST_ADMIN_SERVER_PORT: '3101',
    });
  });

  it('rejects an unknown compute size', () => {
    expect(() => buildComputePod({ ...input, computeSize: '3' })).toThrowError(
      /Unknown compute size/,
    );
  });
});

describe('postgrest naming', () => {
  it('turns database names into container-safe labels', () => {
    expect(postgrestContainerName('App_DB')).toBe('postgrest-app-db');
    expect(postgrestContainerName('x'.repeat(100)).length).toBeLessThanOrEqual(
      63,
    );
    expect(postgrestApiPort(2)).toBe(3002);
  });
});
