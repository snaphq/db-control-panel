import { describe, expect, it } from 'vitest';
import { SCRAM_ITERATIONS, buildScramSecret } from './scram.js';

/**
 * Expected values come from an independent implementation (Python hashlib):
 *
 *   sp = hashlib.pbkdf2_hmac('sha256', pw, salt, i, 32)
 *   ck = hmac.new(sp, b'Client Key', sha256).digest()
 *   "SCRAM-SHA-256$i:b64(salt)$b64(sha256(ck)):b64(hmac(sp, b'Server Key'))"
 *
 * The first two also match PostgreSQL's own scram_build_secret layout.
 */
const VECTORS = [
  {
    password: 'pencil',
    salt: Buffer.from(Array.from({ length: 16 }, (_, index) => index)),
    iterations: 4096,
    secret:
      'SCRAM-SHA-256$4096:AAECAwQFBgcICQoLDA0ODw==$zHCdol2044/ZyWzPLi7oxApCkamKw9Z+E4U/QApd/5Y=:dd5peBOitVnLNFu7VmwP+HiDaaw4OUCv396eVCWhYiE=',
  },
  {
    password: 'pencil',
    salt: Buffer.from('W22ZaJ0SNY7soEsUEjb6gQ==', 'base64'),
    iterations: 4096,
    secret:
      'SCRAM-SHA-256$4096:W22ZaJ0SNY7soEsUEjb6gQ==$WG5d8oPm3OtcPnkdi4Uo7BkeZkBFzpcXkuLmtbsT4qY=:wfPLwcE6nTWhTAmQ7tl2KeoiWGPlZqQxSrmfPwDl2dU=',
  },
  {
    password: 'correct horse battery staple',
    salt: Buffer.alloc(16, 0xff),
    iterations: 4096,
    secret:
      'SCRAM-SHA-256$4096://///////////////////w==$MX5J/XX1GA5BlAcKzIjamREsyS/3/IrFmbeGjD+u2G0=:CKOqQIs3VBHoDDNhYkajzog+8G3CvjgmPVvn9VPrN+g=',
  },
  {
    password: 'p@ss w0rd!',
    salt: Buffer.from('0123456789abcdef'),
    iterations: 1,
    secret:
      'SCRAM-SHA-256$1:MDEyMzQ1Njc4OWFiY2RlZg==$oYfxqzSUZKxpCUV5IK5if4X4MKg/QgF7ScVnAdMDxtc=:EvUnLJJaasbnazxoc49YmHQr16LkRI2WCcKbZP4TnmY=',
  },
];

describe('buildScramSecret', () => {
  for (const vector of VECTORS) {
    it(`matches the independent vector for "${vector.password}" (i=${vector.iterations})`, () => {
      expect(
        buildScramSecret(vector.password, {
          salt: vector.salt,
          iterations: vector.iterations,
        }),
      ).toBe(vector.secret);
    });
  }

  it('uses PostgreSQL defaults and a random 16-byte salt', () => {
    const first = buildScramSecret('hunter2');
    const second = buildScramSecret('hunter2');
    const pattern =
      /^SCRAM-SHA-256\$(\d+):([A-Za-z0-9+/]{22}==)\$([A-Za-z0-9+/]{43}=):([A-Za-z0-9+/]{43}=)$/;
    const match = pattern.exec(first);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(SCRAM_ITERATIONS);
    expect(Buffer.from(match?.[2] ?? '', 'base64')).toHaveLength(16);
    expect(first).not.toBe(second);
  });

  it('never contains the plaintext password', () => {
    expect(buildScramSecret('plaintext-needle')).not.toContain('plaintext');
  });

  it('rejects empty and non-ASCII passwords', () => {
    expect(() => buildScramSecret('')).toThrowError(/must not be empty/);
    expect(() => buildScramSecret('pässword')).toThrowError(/ASCII/);
  });

  it('rejects an invalid iteration count', () => {
    expect(() => buildScramSecret('a', { iterations: 0 })).toThrowError(
      /iteration count/,
    );
  });
});
