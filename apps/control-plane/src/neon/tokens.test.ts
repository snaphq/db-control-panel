import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createEd25519Signer } from '../crypto/ed25519.js';
import { newEndpointId, newNeonId } from '../crypto/ids.js';
import {
  COMPUTE_ADMIN_TOKEN_TTL_SECONDS,
  mintComputeAdminToken,
  mintComputeSpecToken,
  mintStorageToken,
  verifyComputeSpecToken,
} from './tokens.js';

const signer = createEd25519Signer(generateKeyPairSync('ed25519').privateKey);
const NOW = new Date('2026-01-02T03:04:05Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);

function decode(token: string): {
  header: Record<string, unknown>;
  claims: Record<string, unknown>;
  validSignature: boolean;
} {
  const [header, payload, signature] = token.split('.') as [
    string,
    string,
    string,
  ];
  return {
    header: JSON.parse(Buffer.from(header, 'base64url').toString()),
    claims: JSON.parse(Buffer.from(payload, 'base64url').toString()),
    validSignature: verify(
      null,
      Buffer.from(`${header}.${payload}`),
      createPublicKey(signer.publicKeyPem),
      Buffer.from(signature, 'base64url'),
    ),
  };
}

describe('mintStorageToken', () => {
  it('serializes scopes exactly as the Rust enum does', () => {
    const scopes = [
      'pageserverapi',
      'safekeeperdata',
      'generations_api',
      'admin',
      'infra',
      'scrubber',
      'controller_peer',
    ] as const;
    for (const scope of scopes) {
      const { claims, header, validSignature } = decode(
        mintStorageToken(signer, { scope }, NOW),
      );
      expect(header).toEqual({ alg: 'EdDSA', typ: 'JWT' });
      expect(claims).toEqual({ scope, iat: NOW_SECONDS });
      expect(validSignature).toBe(true);
    }
  });

  it('puts the tenant id on tenant-scoped tokens', () => {
    const tenantId = newNeonId();
    const { claims } = decode(
      mintStorageToken(signer, { scope: 'tenant', tenantId }, NOW),
    );
    expect(claims).toEqual({
      scope: 'tenant',
      tenant_id: tenantId,
      iat: NOW_SECONDS,
    });
  });

  it('serializes TenantEndpoint as "tenantendpoint"', () => {
    const tenantId = newNeonId();
    const { claims } = decode(
      mintStorageToken(signer, { scope: 'tenantendpoint', tenantId }, NOW),
    );
    expect(claims.scope).toBe('tenantendpoint');
    expect(claims.tenant_id).toBe(tenantId);
  });

  it('does not set exp, which Neon does not require', () => {
    const { claims } = decode(
      mintStorageToken(signer, { scope: 'admin' }, NOW),
    );
    expect(claims).not.toHaveProperty('exp');
  });

  it('refuses tenant scopes without a valid tenant id', () => {
    expect(() => mintStorageToken(signer, { scope: 'tenant' })).toThrowError(
      /32-hex tenant id/,
    );
    expect(() =>
      mintStorageToken(signer, { scope: 'tenant', tenantId: 'nope' }),
    ).toThrowError(/32-hex tenant id/);
  });

  it('refuses a tenant id on non-tenant scopes', () => {
    expect(() =>
      mintStorageToken(signer, { scope: 'admin', tenantId: newNeonId() }),
    ).toThrowError(/must not carry a tenant id/);
  });
});

describe('mintComputeAdminToken', () => {
  it('carries aud, scope, and compute_id as compute_ctl expects', () => {
    const { claims, validSignature } = decode(
      mintComputeAdminToken(signer, 'ep-cool-darkness-abcd1234', NOW),
    );
    expect(claims).toEqual({
      aud: ['compute'],
      scope: 'compute_ctl:admin',
      compute_id: 'ep-cool-darkness-abcd1234',
      iat: NOW_SECONDS,
      exp: NOW_SECONDS + COMPUTE_ADMIN_TOKEN_TTL_SECONDS,
    });
    expect(validSignature).toBe(true);
  });

  it('rejects an empty compute id', () => {
    expect(() => mintComputeAdminToken(signer, '')).toThrowError(/computeId/);
  });
});

describe('compute spec tokens', () => {
  const tenantId = newNeonId();
  const endpointId = newEndpointId();

  it('carries a tenantendpoint scope bound to the tenant and endpoint', () => {
    const { claims, header, validSignature } = decode(
      mintComputeSpecToken(signer, { tenantId, endpointId }, NOW),
    );
    expect(header).toEqual({ alg: 'EdDSA', typ: 'JWT' });
    expect(validSignature).toBe(true);
    expect(claims).toEqual({
      scope: 'tenantendpoint',
      tenant_id: tenantId,
      compute_id: endpointId,
      iat: NOW_SECONDS,
    });
  });

  it('verifies back to the same ids', () => {
    expect(
      verifyComputeSpecToken(
        signer,
        mintComputeSpecToken(signer, { tenantId, endpointId }),
      ),
    ).toEqual({ tenantId, endpointId });
  });

  it('refuses tokens of another scope or another key', () => {
    const storage = mintStorageToken(signer, { scope: 'tenant', tenantId });
    expect(verifyComputeSpecToken(signer, storage)).toBeNull();
    expect(
      verifyComputeSpecToken(signer, mintComputeAdminToken(signer, endpointId)),
    ).toBeNull();
    const stranger = createEd25519Signer(
      generateKeyPairSync('ed25519').privateKey,
    );
    expect(
      verifyComputeSpecToken(
        signer,
        mintComputeSpecToken(stranger, { tenantId, endpointId }),
      ),
    ).toBeNull();
    expect(verifyComputeSpecToken(signer, 'garbage')).toBeNull();
  });

  it('rejects malformed ids when minting', () => {
    expect(() =>
      mintComputeSpecToken(signer, { tenantId: 'x', endpointId }),
    ).toThrowError(/32 hex/);
    expect(() =>
      mintComputeSpecToken(signer, { tenantId, endpointId: 'compute-1' }),
    ).toThrowError(/endpoint id/);
  });
});
