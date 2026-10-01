import { createHash } from 'node:crypto';

/**
 * sqld namespace names. The only rule sqld itself enforces is "not empty and
 * UTF-8" (libsql-server/src/namespace/name.rs:47-53), but a namespace is also
 * a directory name on the node and, with `--enable-namespaces`, the first
 * label of the Host header (libsql-server/src/http/user/db_factory.rs:114-118,
 * `host.split_once('.')`). So ours must be a DNS label: lowercase letters,
 * digits and hyphens, 1-63 characters, no leading or trailing hyphen.
 */

export const MAX_NAMESPACE_LENGTH = 63;
const TEAM_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
/** Leaves room for the database name (at most 42) and the joining hyphen. */
const MAX_TEAM_LENGTH = MAX_NAMESPACE_LENGTH - 42 - 1;
const NAMESPACE_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** Names sqld treats specially or that would confuse routing. */
const RESERVED_NAMESPACES = new Set(['default', 'www', 'admin']);

/**
 * The `<team>` part of `<db>-<team>`: the console organization. An id that is
 * already a short DNS label is used as it is; anything else becomes `t` plus 10
 * hex characters of its SHA-256. Never lossy for readable ids, so two
 * organizations cannot collapse onto one team through case or punctuation.
 */
export function teamSlug(orgId: string): string {
  if (orgId.length <= MAX_TEAM_LENGTH && TEAM_PATTERN.test(orgId)) return orgId;
  return `t${createHash('sha256').update(orgId).digest('hex').slice(0, 10)}`;
}

/** Why `namespace` cannot be used, or null when it can. */
export function namespaceProblem(namespace: string): string | null {
  if (!NAMESPACE_PATTERN.test(namespace)) {
    return 'must be a lowercase DNS label of 1-63 letters, digits and hyphens';
  }
  if (RESERVED_NAMESPACES.has(namespace)) return 'is reserved';
  return null;
}

/** `<db>-<team>`, validated; throws with the reason so callers fail fast. */
export function namespaceFor(databaseName: string, orgId: string): string {
  const namespace = `${databaseName}-${teamSlug(orgId)}`;
  const problem = namespaceProblem(namespace);
  if (problem) throw new Error(`Namespace "${namespace}" ${problem}`);
  return namespace;
}

export const libsqlHostname = (namespace: string, suffix: string): string =>
  `${namespace}.${suffix}`;

export const libsqlUrl = (namespace: string, suffix: string): string =>
  `libsql://${libsqlHostname(namespace, suffix)}`;
