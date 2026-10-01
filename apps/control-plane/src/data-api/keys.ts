import {
  type JsonWebKey,
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  sign,
} from 'node:crypto';
import type { DataApiRole, Jwks } from '@repo/control-plane-contract';

/**
 * The platform-issued key of a project's Data API. PostgREST verifies bearer
 * tokens against a JWKS (`PGRST_JWT_SECRET`, v16.4 docs/references/auth.rst
 * "Asymmetric Keys"); the control plane keeps the private half sealed so the
 * console can mint test tokens without the project bringing its own identity
 * provider.
 *
 * The algorithm is ES256 (ECDSA on P-256), not EdDSA: PostgREST decodes tokens
 * with the Haskell jose-jwt library (src/library/PostgREST/Auth/Jwt.hs) and
 * ES256 is the asymmetric algorithm every release of it has supported, while
 * Ed25519 support depends on the jose-jwt version in the build.
 */

export interface DataApiKey {
  /** Public JWKS stored in the project row and handed to PostgREST. */
  jwks: Jwks;
  /** The private JWK as JSON; seal it before storing. */
  privateJwk: string;
}

/** RFC 7638 thumbprint of an EC key, used as `kid`. */
function thumbprint(jwk: { crv?: string; x?: string; y?: string }): string {
  const canonical = `{"crv":"${jwk.crv}","kty":"EC","x":"${jwk.x}","y":"${jwk.y}"}`;
  return createHash('sha256').update(canonical).digest('base64url');
}

export function generateDataApiKey(): DataApiKey {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const full = privateKey.export({ format: 'jwk' });
  const kid = thumbprint(full);
  const { d: _secret, ...publicPart } = full;
  return {
    jwks: {
      keys: [{ ...publicPart, kty: 'EC', kid, alg: 'ES256', use: 'sig' }],
    },
    privateJwk: JSON.stringify({ ...full, kid, alg: 'ES256', use: 'sig' }),
  };
}

const b64url = (input: string | Buffer): string =>
  Buffer.from(input).toString('base64url');

export interface DataApiToken {
  token: string;
  expiresAt: Date;
}

/** Signs a token PostgREST maps to the database role in its `role` claim. */
export function signDataApiToken(
  privateJwk: string,
  input: {
    role: DataApiRole;
    sub?: string;
    expiresInSeconds: number;
    now?: Date;
  },
): DataApiToken {
  const jwk = JSON.parse(privateJwk) as JsonWebKey & { kid?: string };
  const key = createPrivateKey({ key: jwk, format: 'jwk' });
  const issuedAt = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const expiresAt = new Date((issuedAt + input.expiresInSeconds) * 1000);
  const header = {
    alg: 'ES256',
    typ: 'JWT',
    ...(jwk.kid ? { kid: jwk.kid } : {}),
  };
  const claims = {
    role: input.role,
    ...(input.sub ? { sub: input.sub } : {}),
    iss: 'alloydb',
    iat: issuedAt,
    exp: issuedAt + input.expiresInSeconds,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  // JWS wants the raw r||s signature, not the DER encoding Node produces by default.
  const signature = sign('sha256', Buffer.from(signingInput), {
    key,
    dsaEncoding: 'ieee-p1363',
  });
  return { token: `${signingInput}.${b64url(signature)}`, expiresAt };
}
