import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createEd25519Signer,
  loadEd25519PrivateKey,
  parseEd25519PrivateKey,
} from './ed25519.js';

const dir = mkdtempSync(join(tmpdir(), 'cp-ed25519-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const { privateKey } = generateKeyPairSync('ed25519');
const privatePem = privateKey
  .export({ type: 'pkcs8', format: 'pem' })
  .toString();

const decodePart = (part: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

describe('createEd25519Signer', () => {
  const signer = createEd25519Signer(privateKey);

  it('signs a JWT that verifies with the public key', () => {
    const token = signer.sign({ scope: 'admin' });
    const [header, payload, signature] = token.split('.') as [
      string,
      string,
      string,
    ];
    expect(decodePart(header)).toEqual({ alg: 'EdDSA', typ: 'JWT' });
    expect(decodePart(payload)).toEqual({ scope: 'admin' });
    const ok = verify(
      null,
      Buffer.from(`${header}.${payload}`),
      createPublicKey(signer.publicKeyPem),
      Buffer.from(signature, 'base64url'),
    );
    expect(ok).toBe(true);
  });

  it('adds the kid header on request', () => {
    const [header] = signer.sign({}, { includeKeyId: true }).split('.');
    expect(decodePart(header as string).kid).toBe(signer.keyId);
  });

  it('rejects a tampered payload', () => {
    const [header, , signature] = signer.sign({ scope: 'tenant' }).split('.');
    const forged = Buffer.from(JSON.stringify({ scope: 'admin' })).toString(
      'base64url',
    );
    expect(
      verify(
        null,
        Buffer.from(`${header}.${forged}`),
        createPublicKey(signer.publicKeyPem),
        Buffer.from(signature as string, 'base64url'),
      ),
    ).toBe(false);
  });

  it('builds an OKP JWK that round-trips to the same public key', () => {
    expect(signer.jwk).toMatchObject({
      kty: 'OKP',
      crv: 'Ed25519',
      use: 'sig',
      alg: 'EdDSA',
      kid: signer.keyId,
    });
    expect(signer.jwks).toEqual({ keys: [signer.jwk] });
    const fromJwk = createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: signer.jwk.x },
      format: 'jwk',
    });
    expect(fromJwk.export({ type: 'spki', format: 'pem' }).toString()).toBe(
      signer.publicKeyPem,
    );
  });

  it('derives a stable RFC 7638 thumbprint as kid', () => {
    expect(createEd25519Signer(privateKey).keyId).toBe(signer.keyId);
    const other = createEd25519Signer(
      generateKeyPairSync('ed25519').privateKey,
    );
    expect(other.keyId).not.toBe(signer.keyId);
    expect(signer.keyId).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('verify', () => {
  const signer = createEd25519Signer(privateKey);
  const other = createEd25519Signer(generateKeyPairSync('ed25519').privateKey);
  const now = new Date('2026-01-01T00:00:00Z');

  it('returns the claims of a token it signed', () => {
    expect(signer.verify(signer.sign({ scope: 'admin' }))).toEqual({
      scope: 'admin',
    });
  });

  it('rejects a token signed by another key', () => {
    expect(signer.verify(other.sign({ scope: 'admin' }))).toBeNull();
  });

  it('rejects tampered payloads, other algorithms and garbage', () => {
    const [header, , signature] = signer.sign({ scope: 'tenant' }).split('.');
    const forged = Buffer.from('{"scope":"admin"}').toString('base64url');
    expect(signer.verify(`${header}.${forged}.${signature}`)).toBeNull();
    const none = Buffer.from('{"alg":"none"}').toString('base64url');
    expect(signer.verify(`${none}.${forged}.`)).toBeNull();
    for (const junk of ['', 'a.b', 'a.b.c', '...', 'x'.repeat(50)]) {
      expect(signer.verify(junk)).toBeNull();
    }
  });

  it('enforces exp only when the token has one', () => {
    const expiring = signer.sign({
      exp: Math.floor(now.getTime() / 1000) + 60,
    });
    expect(signer.verify(expiring, now)).not.toBeNull();
    expect(
      signer.verify(expiring, new Date(now.getTime() + 61_000)),
    ).toBeNull();
    expect(signer.verify(signer.sign({ scope: 'tenant' }), now)).not.toBeNull();
  });
});

describe('loadEd25519PrivateKey', () => {
  it('loads a PEM file', () => {
    const path = join(dir, 'private.pem');
    writeFileSync(path, privatePem);
    expect(loadEd25519PrivateKey(path).asymmetricKeyType).toBe('ed25519');
  });

  it('names the path when the file is missing', () => {
    expect(() => loadEd25519PrivateKey(join(dir, 'missing.pem'))).toThrowError(
      /Cannot read the Ed25519 private key at .*missing\.pem/,
    );
  });

  it('rejects garbage and non-Ed25519 keys', () => {
    expect(() => parseEd25519PrivateKey('not a pem', 'test.pem')).toThrowError(
      /test\.pem is not a readable PEM private key/,
    );
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString();
    expect(() => parseEd25519PrivateKey(rsa, 'rsa.pem')).toThrowError(
      /rsa\.pem must be an Ed25519 key, found rsa/,
    );
  });
});
