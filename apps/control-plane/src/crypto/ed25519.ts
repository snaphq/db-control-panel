import {
  type KeyObject,
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Public half of an Ed25519 key as a JWK (RFC 8037), the shape compute_ctl's JwkSet expects. */
interface Ed25519Jwk {
  kty: 'OKP';
  crv: 'Ed25519';
  x: string;
  kid: string;
  use: 'sig';
  alg: 'EdDSA';
}

interface Jwks {
  keys: Ed25519Jwk[];
}

interface JwtSignOptions {
  /** Adds a `kid` header. Neon verifiers ignore it; JWKS consumers can match on it. */
  includeKeyId?: boolean;
}

export interface Ed25519Signer {
  readonly keyId: string;
  readonly jwk: Ed25519Jwk;
  readonly jwks: Jwks;
  /** SPKI PEM, the format Neon services read from `PUBLIC_KEY`. */
  readonly publicKeyPem: string;
  sign(claims: object, options?: JwtSignOptions): string;
  /**
   * Checks the signature, the `EdDSA` algorithm and `exp` (when present) of a
   * token this key pair issued and returns its claims, or null for anything
   * else. It never throws on bad input.
   */
  verify(token: string, now?: Date): Record<string, unknown> | null;
}

const base64Url = (input: Buffer | string): string =>
  Buffer.from(input).toString('base64url');

/** Parses a PKCS#8 PEM and rejects anything that is not an Ed25519 private key. */
export function parseEd25519PrivateKey(pem: string, source: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPrivateKey(pem);
  } catch (error) {
    throw new Error(
      `${source} is not a readable PEM private key: ${(error as Error).message}`,
    );
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error(
      `${source} must be an Ed25519 key, found ${key.asymmetricKeyType ?? 'unknown'}`,
    );
  }
  return key;
}

export function loadEd25519PrivateKey(path: string): KeyObject {
  let pem: string;
  try {
    pem = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(
      `Cannot read the Ed25519 private key at ${path}: ${(error as Error).message}`,
    );
  }
  return parseEd25519PrivateKey(pem, path);
}

function rawPublicKey(privateKey: KeyObject): Buffer {
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
  if (!jwk.x) throw new Error('Ed25519 public key export has no x coordinate');
  return Buffer.from(jwk.x, 'base64url');
}

/** RFC 7638 JWK thumbprint of the public key, used as `kid`. */
function thumbprint(x: string): string {
  const canonical = `{"crv":"Ed25519","kty":"OKP","x":"${x}"}`;
  return createHash('sha256').update(canonical).digest('base64url');
}

function decodeJson(part: string): Record<string, unknown> | null {
  const value: unknown = JSON.parse(
    Buffer.from(part, 'base64url').toString('utf8'),
  );
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function createEd25519Signer(privateKey: KeyObject): Ed25519Signer {
  const publicKey = createPublicKey(privateKey);
  const x = base64Url(rawPublicKey(privateKey));
  const keyId = thumbprint(x);
  const jwk: Ed25519Jwk = {
    kty: 'OKP',
    crv: 'Ed25519',
    x,
    kid: keyId,
    use: 'sig',
    alg: 'EdDSA',
  };
  const publicKeyPem = createPublicKey(privateKey)
    .export({ type: 'spki', format: 'pem' })
    .toString();

  return {
    keyId,
    jwk,
    jwks: { keys: [jwk] },
    publicKeyPem,
    sign(claims, options = {}) {
      const header = options.includeKeyId
        ? { alg: 'EdDSA', typ: 'JWT', kid: keyId }
        : { alg: 'EdDSA', typ: 'JWT' };
      const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
      const signature = sign(null, Buffer.from(signingInput), privateKey);
      return `${signingInput}.${base64Url(signature)}`;
    },
    verify(token, now = new Date()) {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [header, payload, signature] = parts as [string, string, string];
      try {
        if (decodeJson(header)?.alg !== 'EdDSA') return null;
        const valid = verify(
          null,
          Buffer.from(`${header}.${payload}`),
          publicKey,
          Buffer.from(signature, 'base64url'),
        );
        if (!valid) return null;
        const claims = decodeJson(payload);
        if (!claims) return null;
        if (
          typeof claims.exp === 'number' &&
          claims.exp * 1000 <= now.getTime()
        ) {
          return null;
        }
        return claims;
      } catch {
        return null;
      }
    },
  };
}

/** Reads the PEM at `path` and wraps it in a signer; the one call modes make at startup. */
export function loadSigner(path: string): Ed25519Signer {
  return createEd25519Signer(loadEd25519PrivateKey(path));
}
