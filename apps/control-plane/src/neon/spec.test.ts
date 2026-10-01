import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createEd25519Signer } from '../crypto/ed25519.js';
import { newEndpointId, newNeonId } from '../crypto/ids.js';
import { SAFEKEEPER_PG_PORT } from './safekeepers.js';
import {
  type BuildSpecInput,
  SpecNotReadyError,
  attachToConnectionInfo,
  buildComputeConfig,
  locateToConnectionInfo,
  shardIndexKey,
} from './spec.js';
import type { LocateResponse, StorconNode } from './storcon-client.js';
import type { BranchRow, EndpointRow, ProjectRow } from './store.js';

const signer = createEd25519Signer(generateKeyPairSync('ed25519').privateKey);
const tenantId = newNeonId();
const timelineId = newNeonId();
const NOW = new Date('2026-01-02T03:04:05Z');

const locate: LocateResponse = {
  shards: [
    {
      shard_id: tenantId,
      node_id: 7,
      listen_pg_addr: '100.64.0.7',
      listen_pg_port: 6400,
    },
  ],
  shard_params: { count: 0, stripe_size: 2048 },
};

const project: ProjectRow = {
  id: 'proj_1',
  consoleProjectId: 'console-1',
  consoleOrgId: 'org_1',
  name: 'demo',
  tenantId,
  pgVersion: 17,
  historyRetentionSeconds: 86_400,
  allowedIps: null,
  createdAt: NOW,
  deletedAt: null,
};

const branch: BranchRow = {
  id: 'br_1',
  projectId: 'proj_1',
  name: 'main',
  timelineId,
  parentBranchId: null,
  parentLsn: null,
  safekeepers: {
    generation: 3,
    safekeepers: [
      { id: 1, hostname: 'safekeeper-0.safekeeper.neon.svc.cluster.local' },
      { id: 2, hostname: 'safekeeper-1.safekeeper.neon.svc.cluster.local' },
      { id: 3, hostname: 'safekeeper-2.safekeeper.neon.svc.cluster.local' },
    ],
  },
  isDefault: true,
  createdAt: NOW,
  deletedAt: null,
};

const endpoint: EndpointRow = {
  id: newEndpointId(),
  branchId: 'br_1',
  type: 'read_write',
  computeSize: '1',
  suspendTimeoutSeconds: 300,
  state: 'idle',
  podName: null,
  podIp: null,
  lastActiveAt: null,
  createdAt: NOW,
  deletedAt: null,
};

function input(overrides: Partial<BuildSpecInput> = {}): BuildSpecInput {
  return {
    endpoint,
    branch,
    project,
    roles: [
      {
        id: 'role_1',
        branchId: 'br_1',
        name: 'neondb_owner',
        scramSecret: 'SCRAM-SHA-256$4096:c2FsdA==$c3RvcmVk:c2VydmVy',
        createdAt: NOW,
      },
    ],
    databases: [
      {
        id: 'db_1',
        branchId: 'br_1',
        name: 'neondb',
        ownerRole: 'neondb_owner',
        dataApiEnabled: false,
        createdAt: NOW,
      },
    ],
    pageservers: locateToConnectionInfo(locate),
    signer,
    now: NOW,
    ...overrides,
  };
}

const setting = (config: ReturnType<typeof buildComputeConfig>, name: string) =>
  config.spec.cluster.settings.find((s) => s.name === name);

describe('shardIndexKey', () => {
  it('writes an unsharded tenant as 0000', () => {
    expect(shardIndexKey(tenantId)).toBe('0000');
  });

  it('takes the shard number and count from a sharded id', () => {
    expect(shardIndexKey(`${tenantId}-0102`)).toBe('0102');
    expect(shardIndexKey(`${tenantId}-0A0B`)).toBe('0a0b');
  });

  it('rejects ids that are not TenantShardIds', () => {
    for (const bad of [
      '',
      'abc',
      `${tenantId}-01`,
      `${tenantId}x0102`,
      `${'g'.repeat(32)}-0102`,
    ]) {
      expect(() => shardIndexKey(bad)).toThrowError(/Not a TenantShardId/);
    }
  });
});

describe('locateToConnectionInfo', () => {
  it('mirrors tenant_locate_response_to_conn_info for an unsharded tenant', () => {
    expect(locateToConnectionInfo(locate)).toEqual({
      shard_count: 0,
      stripe_size: null,
      shards: {
        '0000': {
          pageservers: [
            {
              id: 7,
              libpq_url: 'postgres://no_user@100.64.0.7:6400',
              grpc_url: null,
            },
          ],
        },
      },
      prefer_protocol: 'libpq',
    });
  });

  it('keeps every shard of a sharded tenant under its ShardIndex', () => {
    const info = locateToConnectionInfo({
      shards: [
        {
          shard_id: `${tenantId}-0002`,
          node_id: 1,
          listen_pg_addr: 'a',
          listen_pg_port: 1,
        },
        {
          shard_id: `${tenantId}-0102`,
          node_id: 2,
          listen_pg_addr: 'fd7a::2',
          listen_pg_port: 2,
          listen_grpc_addr: 'b',
          listen_grpc_port: 3,
        },
      ],
      shard_params: { count: 2, stripe_size: 2048 },
    });
    expect(info.shard_count).toBe(2);
    expect(info.stripe_size).toBe(2048);
    expect(Object.keys(info.shards).sort()).toEqual(['0002', '0102']);
    expect(info.shards['0102']?.pageservers[0]).toEqual({
      id: 2,
      libpq_url: 'postgres://no_user@[fd7a::2]:2',
      grpc_url: 'grpc://no_user@b:3',
    });
  });
});

describe('attachToConnectionInfo', () => {
  const node = (id: number, addr: string): StorconNode => ({
    id,
    availability: 'Active',
    scheduling: 'Active',
    availability_zone_id: 'az-1',
    listen_pg_addr: addr,
    listen_pg_port: 6400,
    listen_http_addr: addr,
    listen_http_port: 9898,
  });

  it('resolves the notified pageserver through the node list', () => {
    const info = attachToConnectionInfo(
      {
        tenant_id: tenantId,
        stripe_size: null,
        shards: [{ node_id: 2, shard_number: 0 }],
      },
      [node(1, '100.64.0.1'), node(2, '100.64.0.2')],
    );
    expect(info).toEqual({
      shard_count: 0,
      stripe_size: null,
      shards: {
        '0000': {
          pageservers: [
            {
              id: 2,
              libpq_url: 'postgres://no_user@100.64.0.2:6400',
              grpc_url: null,
            },
          ],
        },
      },
      prefer_protocol: 'libpq',
    });
  });

  it('treats a stripe size as a sharded tenant', () => {
    const info = attachToConnectionInfo(
      {
        tenant_id: tenantId,
        stripe_size: 2048,
        shards: [
          { node_id: 1, shard_number: 0 },
          { node_id: 2, shard_number: 1 },
        ],
      },
      [node(1, 'a'), node(2, 'b')],
    );
    expect(info.shard_count).toBe(2);
    expect(Object.keys(info.shards)).toEqual(['0002', '0102']);
  });

  it('is not ready while the pageserver is unknown', () => {
    expect(() =>
      attachToConnectionInfo(
        {
          tenant_id: tenantId,
          stripe_size: null,
          shards: [{ node_id: 9, shard_number: 0 }],
        },
        [],
      ),
    ).toThrowError(SpecNotReadyError);
  });
});

describe('buildComputeConfig', () => {
  const config = buildComputeConfig(input());

  it('answers attached and carries the JWKS compute_ctl verifies with', () => {
    expect(config.status).toBe('attached');
    expect(config.compute_ctl_config).toEqual({ jwks: signer.jwks });
  });

  it('identifies tenant, timeline, project, branch and endpoint', () => {
    expect(config.spec).toMatchObject({
      format_version: 1,
      tenant_id: tenantId,
      timeline_id: timelineId,
      project_id: 'proj_1',
      branch_id: 'br_1',
      endpoint_id: endpoint.id,
      mode: 'Primary',
      suspend_timeout_seconds: 300,
    });
  });

  it('lists roles with their SCRAM secret and databases with their owner', () => {
    expect(config.spec.cluster.roles).toEqual([
      {
        name: 'neondb_owner',
        encrypted_password: 'SCRAM-SHA-256$4096:c2FsdA==$c3RvcmVk:c2VydmVy',
        options: null,
      },
    ]);
    expect(config.spec.cluster.databases).toEqual([
      { name: 'neondb', owner: 'neondb_owner', options: null },
    ]);
  });

  it('carries the base GUCs of the design', () => {
    expect(setting(config, 'wal_level')).toEqual({
      name: 'wal_level',
      value: 'logical',
      vartype: 'enum',
    });
    expect(setting(config, 'synchronous_standby_names')?.value).toBe(
      'walproposer',
    );
    expect(setting(config, 'shared_preload_libraries')?.value).toBe(
      'neon,pg_cron,pg_stat_statements',
    );
    expect(setting(config, 'password_encryption')?.value).toBe('scram-sha-256');
    expect(setting(config, 'listen_addresses')?.value).toBe('*');
    expect(setting(config, 'port')).toEqual({
      name: 'port',
      value: '5432',
      vartype: 'integer',
    });
    expect(setting(config, 'max_replication_write_lag')).toBeDefined();
    expect(setting(config, 'max_replication_flush_lag')).toBeDefined();
  });

  it('sizes memory settings from the compute size', () => {
    expect(setting(config, 'shared_buffers')?.value).toBe('512MB');
    expect(setting(config, 'max_connections')?.value).toBe('448');
    const small = buildComputeConfig(
      input({ endpoint: { ...endpoint, computeSize: '0.25' } }),
    );
    expect(setting(small, 'shared_buffers')?.value).toBe('128MB');
    expect(setting(small, 'max_connections')?.value).toBe('112');
  });

  it('does not repeat the neon.* GUCs compute_ctl derives from the spec', () => {
    const names = config.spec.cluster.settings.map((s) => s.name);
    expect(names.filter((n) => n.startsWith('neon.'))).toEqual([]);
  });

  it('points at the pageserver found by locate', () => {
    expect(
      config.spec.pageserver_connection_info.shards['0000']?.pageservers[0]
        ?.libpq_url,
    ).toBe('postgres://no_user@100.64.0.7:6400');
  });

  it('lists safekeepers with the generation from the branch row', () => {
    expect(config.spec.safekeeper_connstrings).toEqual([
      `safekeeper-0.safekeeper.neon.svc.cluster.local:${SAFEKEEPER_PG_PORT}`,
      `safekeeper-1.safekeeper.neon.svc.cluster.local:${SAFEKEEPER_PG_PORT}`,
      `safekeeper-2.safekeeper.neon.svc.cluster.local:${SAFEKEEPER_PG_PORT}`,
    ]);
    expect(config.spec.safekeepers_generation).toBe(3);
  });

  it('mints a tenant-scoped storage token that verifies', () => {
    const claims = signer.verify(config.spec.storage_auth_token);
    expect(claims).toEqual({
      scope: 'tenant',
      tenant_id: tenantId,
      iat: Math.floor(NOW.getTime() / 1000),
    });
  });

  it('adds delete_db operations only when asked', () => {
    expect(config.spec.delta_operations).toBeNull();
    const withDelete = buildComputeConfig(
      input({
        deltaOperations: [{ action: 'delete_db', name: 'old', new_name: null }],
      }),
    );
    expect(withDelete.spec.delta_operations).toEqual([
      { action: 'delete_db', name: 'old', new_name: null },
    ]);
  });

  it('turns a read-only endpoint into a replica following the safekeepers', () => {
    const replica = buildComputeConfig(
      input({ endpoint: { ...endpoint, type: 'read_only' } }),
    );
    expect(replica.spec.mode).toBe('Replica');
    expect(replica.spec.safekeeper_connstrings).toEqual([]);
    expect(replica.spec.safekeepers_generation).toBeNull();
    expect(setting(replica, 'synchronous_standby_names')).toBeUndefined();
    expect(setting(replica, 'primary_conninfo')?.value).toContain(
      `options='-c timeline_id=${timelineId} tenant_id=${tenantId}'`,
    );
    expect(setting(replica, 'primary_conninfo')?.value).toContain(
      'port=5454,5454,5454',
    );
  });

  it('is not ready without a safekeeper placement', () => {
    for (const safekeepers of [null, { generation: 1, safekeepers: [] }]) {
      expect(() =>
        buildComputeConfig(input({ branch: { ...branch, safekeepers } })),
      ).toThrowError(SpecNotReadyError);
    }
  });

  it('serializes to JSON compute_ctl can deserialize', () => {
    const wire = JSON.parse(JSON.stringify(config));
    expect(
      wire.spec.cluster.settings.every(
        (s: { name: string; value: string; vartype: string }) =>
          ['string', 'integer', 'bool', 'enum'].includes(s.vartype) &&
          typeof s.value === 'string',
      ),
    ).toBe(true);
    expect(wire.spec.mode).toBe('Primary');
    expect(wire.spec.pageserver_connection_info.prefer_protocol).toBe('libpq');
    expect(wire.compute_ctl_config.jwks.keys[0]).toMatchObject({
      kty: 'OKP',
      crv: 'Ed25519',
      alg: 'EdDSA',
    });
  });
});
