import { type JsonWebKey, createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateDataApiKey, signDataApiToken } from './keys.js';

const decode = (part: string) =>
  JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

const publicKeyOf = (key: ReturnType<typeof generateDataApiKey>) =>
  createPublicKey({ key: key.jwks.keys[0] as JsonWebKey, format: 'jwk' });

const verifies = (token: string, key: ReturnType<typeof createPublicKey>) => {
  const [header, payload, signature] = token.split('.') as [
    string,
    string,
    string,
  ];
  return verify(
    'sha256',
    Buffer.from(`${header}.${payload}`),
    { key, dsaEncoding: 'ieee-p1363' },
    Buffer.from(signature, 'base64url'),
  );
};

describe('generateDataApiKey', () => {
  it('publishes only the public half, tagged for ES256 signing', () => {
    const key = generateDataApiKey();
    expect(key.jwks.keys).toHaveLength(1);
    const [jwk] = key.jwks.keys;
    expect(jwk).toMatchObject({
      kty: 'EC',
      crv: 'P-256',
      alg: 'ES256',
      use: 'sig',
    });
    expect(jwk).not.toHaveProperty('d');
    expect(typeof jwk?.kid).toBe('string');
    const privateParts = JSON.parse(key.privateJwk);
    expect(privateParts).toHaveProperty('d');
    expect(JSON.stringify(key.jwks)).not.toContain(privateParts.d);
  });

  it('gives each project its own key', () => {
    expect(generateDataApiKey().jwks.keys[0]?.kid).not.toBe(
      generateDataApiKey().jwks.keys[0]?.kid,
    );
  });
});

describe('signDataApiToken', () => {
  const now = new Date('2026-03-04T05:06:07Z');

  it('signs a JWT that the published key verifies', () => {
    const key = generateDataApiKey();
    const { token, expiresAt } = signDataApiToken(key.privateJwk, {
      role: 'authenticated',
      sub: 'user-1',
      expiresInSeconds: 900,
      now,
    });
    const [header, payload, signature] = token.split('.') as [
      string,
      string,
      string,
    ];
    expect(decode(header)).toEqual({
      alg: 'ES256',
      typ: 'JWT',
      kid: key.jwks.keys[0]?.kid,
    });
    const issuedAt = Math.floor(now.getTime() / 1000);
    expect(decode(payload)).toEqual({
      role: 'authenticated',
      sub: 'user-1',
      iss: 'alloydb',
      iat: issuedAt,
      exp: issuedAt + 900,
    });
    expect(expiresAt.toISOString()).toBe('2026-03-04T05:21:07.000Z');
    // JWS ES256 signatures are 64 raw bytes (r then s), not DER.
    expect(Buffer.from(signature, 'base64url')).toHaveLength(64);
    expect(verifies(token, publicKeyOf(key))).toBe(true);
  });

  it('does not verify under another key', () => {
    const { token } = signDataApiToken(generateDataApiKey().privateJwk, {
      role: 'anonymous',
      expiresInSeconds: 60,
    });
    expect(verifies(token, publicKeyOf(generateDataApiKey()))).toBe(false);
  });

  it('leaves sub out when none is given', () => {
    const { token } = signDataApiToken(generateDataApiKey().privateJwk, {
      role: 'anonymous',
      expiresInSeconds: 60,
    });
    expect(decode(token.split('.')[1] ?? '')).not.toHaveProperty('sub');
  });
});
