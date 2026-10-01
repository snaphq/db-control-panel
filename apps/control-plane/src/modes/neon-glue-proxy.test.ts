import { describe, expect, it } from 'vitest';
import { newEndpointId } from '../crypto/ids.js';
import { StorconError } from '../neon/storcon-client.js';
import { CONTROL_TOKEN, PROXY_TOKEN, get, setup } from './neon-glue.fixture.js';

describe('/proxy authentication', () => {
  it('requires the proxy token on every route', async () => {
    const t = await setup();
    for (const path of [
      `/proxy/get_endpoint_access_control?endpointish=${t.endpointId}&role=x`,
      `/proxy/wake_compute?endpointish=${t.endpointId}`,
      `/proxy/endpoints/${t.endpointId}/jwks`,
    ]) {
      expect((await get(t.app, path, {})).status).toBe(401);
      expect(
        (await get(t.app, path, { authorization: 'Bearer wrong' })).status,
      ).toBe(401);
      // The storage controller's token must not open the proxy routes.
      expect(
        (await get(t.app, path, { authorization: `Bearer ${CONTROL_TOKEN}` }))
          .status,
      ).toBe(401);
    }
    expect(t.pods.created).toEqual([]);
  });
});

describe('GET /proxy/get_endpoint_access_control', () => {
  it('returns the role secret with the project and account ids', async () => {
    const t = await setup();
    const response = await get(
      t.app,
      `/proxy/get_endpoint_access_control?endpointish=${t.endpointId}&role=neondb_owner&session_id=s&application_name=psql`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      role_secret: 'SCRAM-SHA-256$4096:c2FsdA==$c3RvcmVk:c2VydmVy',
      project_id: t.projectId,
      account_id: 'org_1',
    });
  });

  it('answers an empty secret for a role that does not exist', async () => {
    const t = await setup();
    const body = await (
      await get(
        t.app,
        `/proxy/get_endpoint_access_control?endpointish=${t.endpointId}&role=nobody`,
      )
    ).json();
    expect(body).toMatchObject({ role_secret: '' });
  });

  it('includes the project IP allow list only when it has one', async () => {
    const t = await setup();
    const project = t.store.projects.get(t.projectId);
    if (project) project.allowedIps = ['203.0.113.0/24', '198.51.100.7'];
    const body = await (
      await get(
        t.app,
        `/proxy/get_endpoint_access_control?endpointish=${t.endpointId}&role=neondb_owner`,
      )
    ).json();
    expect(body.allowed_ips).toEqual(['203.0.113.0/24', '198.51.100.7']);
  });

  it('treats the -pooler name as the same endpoint', async () => {
    const t = await setup();
    const response = await get(
      t.app,
      `/proxy/get_endpoint_access_control?endpointish=${t.endpointId}-pooler&role=neondb_owner`,
    );
    expect(response.status).toBe(200);
  });

  it('reports unknown, malformed and deleted endpoints in the proxy error format', async () => {
    const t = await setup();
    for (const name of ['ep-no-such-00000000', 'garbage', '', 'ep-a-b-c']) {
      const response = await get(
        t.app,
        `/proxy/get_endpoint_access_control?endpointish=${name}&role=x`,
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: 'endpoint not found',
        status: {
          code: 'ENDPOINT_NOT_FOUND',
          message: 'endpoint not found',
          details: { error_info: { reason: 'ENDPOINT_NOT_FOUND' } },
        },
      });
    }
    const endpoint = t.store.endpoints.get(t.endpointId);
    if (endpoint) endpoint.deletedAt = new Date();
    expect(
      (
        await get(
          t.app,
          `/proxy/get_endpoint_access_control?endpointish=${t.endpointId}&role=x`,
        )
      ).status,
    ).toBe(404);
  });
});

describe('GET /proxy/wake_compute', () => {
  it('starts the compute and returns its address with the metrics ids', async () => {
    const t = await setup();
    const response = await get(
      t.app,
      `/proxy/wake_compute?endpointish=${t.endpointId}&session_id=s`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      address: '10.42.0.10:5432',
      aux: {
        endpoint_id: t.endpointId,
        project_id: t.projectId,
        branch_id: t.branchId,
        compute_id: t.endpointId,
        cold_start_info: 'pool_miss',
      },
    });
    expect(t.pods.created).toHaveLength(1);
  });

  it('reports a running compute as warm', async () => {
    const t = await setup();
    await get(t.app, `/proxy/wake_compute?endpointish=${t.endpointId}`);
    const body = await (
      await get(t.app, `/proxy/wake_compute?endpointish=${t.endpointId}`)
    ).json();
    expect(body.aux.cold_start_info).toBe('warm');
    expect(t.pods.created).toHaveLength(1);
  });

  it('sends -pooler connections to PgBouncer on 6432', async () => {
    const t = await setup();
    const body = await (
      await get(t.app, `/proxy/wake_compute?endpointish=${t.endpointId}-pooler`)
    ).json();
    expect(body.address).toBe('10.42.0.10:6432');
    expect(body.aux.endpoint_id).toBe(t.endpointId);
    expect(t.pods.created).toEqual([`compute-${t.endpointId}`]);
  });

  it('coalesces simultaneous connections into one start', async () => {
    const t = await setup();
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        get(t.app, `/proxy/wake_compute?endpointish=${t.endpointId}`),
      ),
    );
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(t.pods.created).toHaveLength(1);
  });

  it('is 404 for an unknown endpoint without starting anything', async () => {
    const t = await setup();
    const response = await get(
      t.app,
      `/proxy/wake_compute?endpointish=${newEndpointId()}`,
    );
    expect(response.status).toBe(404);
    expect((await response.json()).status.details.error_info.reason).toBe(
      'ENDPOINT_NOT_FOUND',
    );
    expect((await get(t.app, '/proxy/wake_compute')).status).toBe(404);
    expect(t.pods.created).toEqual([]);
  });

  it('answers 503 with a retry delay when the compute cannot start yet', async () => {
    const t = await setup();
    t.computeCtl.statuses.set('10.42.0.10', {
      status: 'failed',
      lastActive: null,
      error: 'boom',
    });
    const response = await get(
      t.app,
      `/proxy/wake_compute?endpointish=${t.endpointId}`,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: expect.any(String),
      status: { details: { retry_info: { retry_delay_ms: 2000 } } },
    });
  });

  it('answers 503 when the storage controller is down', async () => {
    const t = await setup();
    t.storcon.locate = new StorconError('down', 'GET', '/x', 503);
    const response = await get(
      t.app,
      `/proxy/wake_compute?endpointish=${t.endpointId}`,
    );
    expect(response.status).toBe(503);
  });
});

describe('GET /proxy/endpoints/:id/jwks', () => {
  it('returns an empty rule set for a known endpoint and 404 otherwise', async () => {
    const t = await setup();
    const ok = await get(t.app, `/proxy/endpoints/${t.endpointId}/jwks`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ jwks: [] });
    expect(
      (await get(t.app, `/proxy/endpoints/${newEndpointId()}/jwks`)).status,
    ).toBe(404);
  });
});
