import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM sealing of the few secrets the control plane must be able to read
 * back: role passwords (to run the Data API bootstrap SQL as the owner), the
 * `authenticator` password and the platform JWT signing key. Everything else is
 * stored as a hash or a SCRAM secret.
 *
 * Sealed form: `v1.<iv>.<tag>.<ciphertext>`, each part base64url. Every value is
 * bound to a `context` string through the GCM additional data, so a ciphertext
 * copied into another column or onto another role fails to open instead of
 * yielding a credential for the wrong thing.
 */

const KEY_BYTES = 32;
const IV_BYTES = 12;
const VERSION = 'v1';

export interface SecretBox {
  seal(plaintext: string, context: string): string;
  /** Throws when the value was tampered with, sealed for another context, or sealed with another key. */
  open(sealed: string, context: string): string;
}

/** Decodes `ALLOYDB_DATA_KEY`: 32 bytes, base64 (standard or URL-safe alphabet). */
export function parseDataKey(value: string): Buffer {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(trimmed)) {
    throw new Error('ALLOYDB_DATA_KEY must be base64');
  }
  const key = Buffer.from(trimmed, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `ALLOYDB_DATA_KEY must decode to ${KEY_BYTES} bytes, got ${key.length} (generate one with: openssl rand -base64 32)`,
    );
  }
  return key;
}

export function createSecretBox(key: Buffer): SecretBox {
  if (key.length !== KEY_BYTES) {
    throw new Error(`The data key must be ${KEY_BYTES} bytes`);
  }
  return {
    seal(plaintext, context) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(context, 'utf8'));
      const body = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);
      return [
        VERSION,
        iv.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        body.toString('base64url'),
      ].join('.');
    },
    open(sealed, context) {
      const parts = sealed.split('.');
      if (parts.length !== 4 || parts[0] !== VERSION) {
        throw new Error('Not a sealed secret of a known version');
      }
      const [, iv, tag, body] = parts as [string, string, string, string];
      try {
        const decipher = createDecipheriv(
          'aes-256-gcm',
          key,
          Buffer.from(iv, 'base64url'),
        );
        decipher.setAAD(Buffer.from(context, 'utf8'));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([
          decipher.update(Buffer.from(body, 'base64url')),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        // Deliberately vague: the cause (wrong key, context or tampering) must not leak.
        throw new Error(
          'Cannot open the sealed secret: wrong key, wrong context or modified data',
        );
      }
    },
  };
}

/** Contexts that bind each sealed value to what it is. */
export const sealContext = {
  rolePassword: (roleName: string): string => `role-password:${roleName}`,
  authenticatorPassword: 'data-api-authenticator-password',
  dataApiSigningKey: 'data-api-signing-key',
} as const;
