import { describe, expect, it } from 'vitest';
import { newEndpointId, newNeonId } from '../crypto/ids.js';
import { newTestSigner } from '../neon/fakes.js';
import { StorconError } from '../neon/storcon-client.js';
import { mintComputeSpecToken } from '../neon/tokens.js';
import {
  CONTROL_TOKEN,
  PROXY_TOKEN,
  get,
  setup,
  signer,
} from './neon-glue.fixture.js';

describe('GET /compute/api/v2/computes/:id/spec', () => {
  const specPath = (id: string) => `/compute/api/v2/computes/${id}/spec`;
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  it('serves the spec to the endpoint that owns the token', async () => {
    const t = await setup();
    const token = mintComputeSpecToken(signer, {
      tenantId: t.tenantId,
      endpointId: t.endpointId,
    });
    const response = await get(t.app, specPath(t.endpointId), bearer(token));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('attached');
    expect(body.spec).toMatchObject({
      endpoint_id: t.endpointId,
      tenant_id: t.tenantId,
      timeline_id: t.timelineId,
      project_id: t.projectId,
      branch_id: t.branchId,
      mode: 'Primary',
    });
    expect(body.compute_ctl_config.jwks.keys).toHaveLength(1);
  });

  it('rejects missing, malformed and foreign tokens with 401', async () => {
    const t = await setup();
    const stranger = newTestSigner();
    const foreign = mintComputeSpecToken(stranger, {
      tenantId: t.tenantId,
      endpointId: t.endpointId,
    });
    for (const headers of [
      {},
      bearer('garbage'),
      bearer(foreign),
      { authorization: 'Basic abc' },
    ]) {
      expect((await get(t.app, specPath(t.endpointId), headers)).status).toBe(
        401,
      );
    }
  });

  it('rejects a token for another endpoint with 403, even in the same project', async () => {
    const t = await setup();
    const other = newEndpointId();
    const token = mintComputeSpecToken(signer, {
      tenantId: t.tenantId,
      endpointId: other,
    });
    expect(
      (await get(t.app, specPath(t.endpointId), bearer(token))).status,
    ).toBe(403);
  });

  it('rejects a token minted for another tenant with 403', async () => {
    const t = await setup();
    const token = mintComputeSpecToken(signer, {
      tenantId: newNeonId(),
      endpointId: t.endpointId,
    });
    expect(
      (await get(t.app, specPath(t.endpointId), bearer(token))).status,
    ).toBe(403);
  });

  it('does not accept the proxy, storage or admin tokens', async () => {
    const t = await setup();
    for (const token of [PROXY_TOKEN, CONTROL_TOKEN]) {
      expect(
        (await get(t.app, specPath(t.endpointId), bearer(token))).status,
      ).toBe(401);
    }
  });

  it('is 404 for an endpoint the control plane does not know', async () => {
    const t = await setup();
    const id = newEndpointId();
    const token = mintComputeSpecToken(signer, {
      tenantId: t.tenantId,
      endpointId: id,
    });
    expect((await get(t.app, specPath(id), bearer(token))).status).toBe(404);
  });

  it('answers 503, which compute_ctl retries, while the spec is not ready', async () => {
    const t = await setup();
    const branch = t.store.branches.get(t.branchId);
    if (branch) branch.safekeepers = null;
    const token = mintComputeSpecToken(signer, {
      tenantId: t.tenantId,
      endpointId: t.endpointId,
    });
    expect(
      (await get(t.app, specPath(t.endpointId), bearer(token))).status,
    ).toBe(503);
    t.storcon.locate = new StorconError('down', 'GET', '/x', 503);
    if (branch)
      branch.safekeepers = {
        generation: 1,
        safekeepers: [{ id: 1, hostname: 'sk' }],
      };
    expect(
      (await get(t.app, specPath(t.endpointId), bearer(token))).status,
    ).toBe(503);
  });
});
