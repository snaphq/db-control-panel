import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSecretBox, parseDataKey, sealContext } from './secretbox.js';

const box = () => createSecretBox(randomBytes(32));

describe('secret box', () => {
  it('round-trips a value', () => {
    const b = box();
    const sealed = b.seal('p4ssw0rd', 'ctx');
    expect(sealed).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(sealed).not.toContain('p4ssw0rd');
    expect(b.open(sealed, 'ctx')).toBe('p4ssw0rd');
  });

  it('uses a fresh nonce each time', () => {
    const b = box();
    expect(b.seal('same', 'ctx')).not.toBe(b.seal('same', 'ctx'));
  });

  it('handles empty and non-ASCII plaintext', () => {
    const b = box();
    expect(b.open(b.seal('', 'ctx'), 'ctx')).toBe('');
    expect(b.open(b.seal('pässwörd', 'ctx'), 'ctx')).toBe('pässwörd');
  });

  it('refuses to open a value under another context', () => {
    const b = box();
    const sealed = b.seal('pw', sealContext.rolePassword('alice'));
    expect(() => b.open(sealed, sealContext.rolePassword('bob'))).toThrow(
      /Cannot open/,
    );
  });

  it('refuses a value sealed with another key', () => {
    const sealed = box().seal('pw', 'ctx');
    expect(() => box().open(sealed, 'ctx')).toThrow(/Cannot open/);
  });

  it('detects a modified ciphertext', () => {
    const b = box();
    const [v, iv, tag, body] = b.seal('secret value', 'ctx').split('.');
    const flipped = Buffer.from(body as string, 'base64url');
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    const forged = [v, iv, tag, flipped.toString('base64url')].join('.');
    expect(() => b.open(forged, 'ctx')).toThrow(/Cannot open/);
  });

  it('rejects malformed input', () => {
    expect(() => box().open('nope', 'ctx')).toThrow(/known version/);
    expect(() => box().open('v2.a.b.c', 'ctx')).toThrow(/known version/);
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => createSecretBox(randomBytes(16))).toThrow(/32 bytes/);
  });
});

describe('parseDataKey', () => {
  it('accepts standard and URL-safe base64 of 32 bytes', () => {
    const raw = Buffer.alloc(32, 0xfb);
    expect(parseDataKey(raw.toString('base64'))).toEqual(raw);
    expect(parseDataKey(raw.toString('base64url'))).toEqual(raw);
    expect(parseDataKey(`  ${raw.toString('base64')}\n`)).toEqual(raw);
  });

  it('rejects other lengths and non-base64', () => {
    expect(() => parseDataKey(randomBytes(31).toString('base64'))).toThrow(
      /32 bytes/,
    );
    expect(() => parseDataKey('not base64!')).toThrow(/base64/);
  });
});
