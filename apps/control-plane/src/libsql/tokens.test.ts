import { describe, expect, it } from 'vitest';
import { newTestSigner } from '../neon/fakes.js';
import { mintLibsqlToken } from './tokens.js';

const signer = newTestSigner();
const NOW = new Date('2026-05-06T07:08:09Z');

const payloadOf = (token: string) =>
  JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString());

describe('mintLibsqlToken', () => {
  it('scopes a read-write token to one namespace', () => {
    const { token, expiresAt } = mintLibsqlToken(signer, {
      namespace: 'orders-acme',
      access: 'read_write',
      now: NOW,
    });
    expect(payloadOf(token)).toEqual({
      iat: 1_778_051_289,
      p: { rw: { ns: ['orders-acme'] } },
    });
    expect(expiresAt).toBeNull();
  });

  it('scopes a read-only token with the ro key', () => {
    const { token } = mintLibsqlToken(signer, {
      namespace: 'orders-acme',
      access: 'read_only',
      now: NOW,
    });
    expect(payloadOf(token).p).toEqual({ ro: { ns: ['orders-acme'] } });
  });

  it('adds exp in seconds when an expiry is given', () => {
    const { token, expiresAt } = mintLibsqlToken(signer, {
      namespace: 'a',
      access: 'read_write',
      expiresInSeconds: 3600,
      now: NOW,
    });
    expect(payloadOf(token).exp).toBe(1_778_051_289 + 3600);
    expect(expiresAt?.toISOString()).toBe('2026-05-06T08:08:09.000Z');
  });

  it('signs with EdDSA so sqld can verify it with the public key', () => {
    const { token } = mintLibsqlToken(signer, {
      namespace: 'a',
      access: 'read_write',
    });
    const header = JSON.parse(
      Buffer.from(token.split('.')[0] ?? '', 'base64url').toString(),
    );
    expect(header.alg).toBe('EdDSA');
    expect(signer.verify(token)).toMatchObject({ p: { rw: { ns: ['a'] } } });
  });

  it('stops verifying once expired', () => {
    const { token } = mintLibsqlToken(signer, {
      namespace: 'a',
      access: 'read_write',
      expiresInSeconds: 60,
      now: NOW,
    });
    expect(
      signer.verify(token, new Date(NOW.getTime() + 30_000)),
    ).not.toBeNull();
    expect(signer.verify(token, new Date(NOW.getTime() + 61_000))).toBeNull();
  });
});
