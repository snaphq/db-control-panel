import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createEd25519Signer } from '../crypto/ed25519.js';
import { newEndpointId, newId, newNeonId } from '../crypto/ids.js';
import { EndpointNotFoundError, createSpecService } from './spec-service.js';
import { SpecNotReadyError } from './spec.js';
import type { StorconClient } from './storcon-client.js';
import { createMemoryNeonStore } from './store-memory.js';

const signer = createEd25519Signer(generateKeyPairSync('ed25519').privateKey);

async function seeded() {
  const store = createMemoryNeonStore();
  const scope = { orgId: 'org_1', consoleProjectId: 'cp_1' };
  const tenantId = newNeonId();
  const endpointId = newEndpointId();
  await store.commit(
    scope,
    { action: 'project.create', targetType: 'project', targetId: 'proj_1' },
    [
      {
        kind: 'project.insert',
        row: {
          id: 'proj_1',
          consoleProjectId: 'cp_1',
          consoleOrgId: 'org_1',
          name: 'demo',
          tenantId,
        },
      },
      {
        kind: 'branch.insert',
        row: {
          id: 'br_1',
          projectId: 'proj_1',
          name: 'main',
          timelineId: newNeonId(),
          isDefault: true,
          safekeepers: {
            generation: 1,
            safekeepers: [{ id: 1, hostname: 'sk-0' }],
          },
        },
      },
      { kind: 'endpoint.insert', row: { id: endpointId, branchId: 'br_1' } },
      {
        kind: 'role.insert',
        row: {
          id: newId('role'),
          branchId: 'br_1',
          name: 'owner',
          scramSecret: 'SCRAM-SHA-256$1:a$b:c',
        },
      },
      {
        kind: 'database.insert',
        row: {
          id: newId('db'),
          branchId: 'br_1',
          name: 'neondb',
          ownerRole: 'owner',
        },
      },
    ],
  );
  const locateTenant = vi.fn(async () => ({
    shards: [
      {
        shard_id: tenantId,
        node_id: 1,
        listen_pg_addr: '100.64.0.1',
        listen_pg_port: 6400,
      },
    ],
    shard_params: { count: 0, stripe_size: 2048 },
  }));
  const storcon = { locateTenant } as unknown as StorconClient;
  return {
    store,
    endpointId,
    tenantId,
    locateTenant,
    service: createSpecService({ store, storcon, signer }),
  };
}

describe('createSpecService', () => {
  it('assembles the spec from rows and the controller placement', async () => {
    const { service, endpointId, tenantId, locateTenant } = await seeded();
    const config = await service.forEndpoint(endpointId);
    expect(locateTenant).toHaveBeenCalledWith(tenantId);
    expect(config.spec).toMatchObject({
      endpoint_id: endpointId,
      tenant_id: tenantId,
      mode: 'Primary',
    });
    expect(config.spec.cluster.roles.map((r) => r.name)).toEqual(['owner']);
    expect(config.spec.cluster.databases.map((d) => d.name)).toEqual([
      'neondb',
    ]);
    expect(config.spec.safekeeper_connstrings).toEqual(['sk-0:5454']);
    expect(config.spec.pageserver_connection_info.shards['0000']).toBeDefined();
  });

  it('skips the controller when the caller already has the placement', async () => {
    const { service, endpointId, locateTenant } = await seeded();
    const pageservers = {
      shard_count: 0,
      stripe_size: null,
      shards: {
        '0000': {
          pageservers: [
            { id: 9, libpq_url: 'postgres://no_user@x:1', grpc_url: null },
          ],
        },
      },
      prefer_protocol: 'libpq' as const,
    };
    const config = await service.forEndpoint(endpointId, { pageservers });
    expect(locateTenant).not.toHaveBeenCalled();
    expect(config.spec.pageserver_connection_info).toEqual(pageservers);
  });

  it('forwards delete_db operations', async () => {
    const { service, endpointId } = await seeded();
    const config = await service.forEndpoint(endpointId, {
      deltaOperations: [{ action: 'delete_db', name: 'old', new_name: null }],
    });
    expect(config.spec.delta_operations).toHaveLength(1);
  });

  it('does not know unknown or deleted endpoints', async () => {
    const { service, store, endpointId } = await seeded();
    await expect(
      service.forEndpoint('ep-none-none-00000000'),
    ).rejects.toBeInstanceOf(EndpointNotFoundError);
    const found = store.endpoints.get(endpointId);
    if (found) found.deletedAt = new Date();
    await expect(service.forEndpoint(endpointId)).rejects.toBeInstanceOf(
      EndpointNotFoundError,
    );
  });

  it('is not ready while the branch has no safekeepers', async () => {
    const { service, store, endpointId } = await seeded();
    const branch = store.branches.get('br_1');
    if (branch) branch.safekeepers = null;
    await expect(service.forEndpoint(endpointId)).rejects.toBeInstanceOf(
      SpecNotReadyError,
    );
  });
});
