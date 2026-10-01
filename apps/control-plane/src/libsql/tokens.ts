import type { LibsqlTokenAccess } from '@repo/control-plane-contract';
import type { Ed25519Signer } from '../crypto/ed25519.js';

/**
 * Per-database sqld tokens: EdDSA JWTs signed with the `libsql-jwt-signing`
 * key, whose public half every node loads with `--auth-jwt-key-file`.
 * libsql-server-v0.24.33:
 *
 * - `auth/user_auth_strategies/jwt.rs:56-66`: the claims are `id`, `a`, `p` and
 *   `exp` (seconds since the epoch, optional; an expired token is rejected,
 *   94-140). `p` wins over the legacy `id`/`a` pair.
 * - `auth/authorized.rs:10-23, 178-184`: `p` is `{ro?, rw?, roa?, rwa?, ddl?}`,
 *   each a `Scopes` with `ns`, a list of namespace names (and `tags`).
 *   `rw` allows reads and writes, `ro` reads only (94-135).
 *
 * A token is therefore valid for exactly the namespaces listed in `ns`.
 */

export interface MintedLibsqlToken {
  token: string;
  /** Null for a token that never expires. */
  expiresAt: Date | null;
}

export function mintLibsqlToken(
  signer: Ed25519Signer,
  input: {
    namespace: string;
    access: LibsqlTokenAccess;
    expiresInSeconds?: number;
    now?: Date;
  },
): MintedLibsqlToken {
  const now = input.now ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1000);
  const scope = input.access === 'read_only' ? 'ro' : 'rw';
  const expiresAt =
    input.expiresInSeconds === undefined
      ? null
      : new Date((issuedAt + input.expiresInSeconds) * 1000);
  const claims = {
    iat: issuedAt,
    ...(expiresAt ? { exp: Math.floor(expiresAt.getTime() / 1000) } : {}),
    p: { [scope]: { ns: [input.namespace] } },
  };
  return { token: signer.sign(claims), expiresAt };
}
