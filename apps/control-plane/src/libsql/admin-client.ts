/**
 * Client of sqld's admin API, one HTTP server per node on
 * `http://<tailscale ip>:8081` (`--admin-listen-addr`). Checked against
 * libsql-server-v0.24.33, libsql-server/src/http/admin/mod.rs:
 *
 * - Routes (143-165): `POST /v1/namespaces/:ns/create`,
 *   `POST /v1/namespaces/:ns/fork/:to`, `DELETE /v1/namespaces/:ns`.
 * - Auth (209-235): `Authorization: Basic <key>`. The second token is compared
 *   with `--admin-auth-key` as it is; it is not base64-decoded, and it is split
 *   on whitespace, so the key must not contain any.
 * - `CreateNamespaceReq` (367-386): every field optional; `max_db_size` is a
 *   `bytesize::ByteSize`, which deserializes from a number of bytes.
 * - Fork (444-471): the body is optional; `timestamp` is a chrono
 *   `NaiveDateTime`, so it carries no time zone (`2026-01-02T03:04:05`).
 * - Delete (512-533): `{"keep_backup": true}` keeps the bottomless backup;
 *   no body prunes it.
 * - Errors (error.rs:151-228): `{"error": "<message>"}`. A namespace that
 *   already exists is `400` ("Namespace `x` already exists") and one that does
 *   not is `404`, which is how the calls below stay idempotent.
 */

const SQLD_ADMIN_PORT = 8081;
const DEFAULT_TIMEOUT_MS = 60_000;

export class SqldAdminError extends Error {
  constructor(
    message: string,
    /** HTTP status, or null when the node could not be reached. */
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'SqldAdminError';
  }
}

interface CreateNamespaceOptions {
  /** Hard size limit; sqld rounds it down to whole 4 KiB pages. */
  maxDbSizeBytes?: number;
}

export interface SqldAdminClient {
  /** `exists` when the namespace was already there, so a retried step succeeds. */
  createNamespace(
    nodeIp: string,
    namespace: string,
    options?: CreateNamespaceOptions,
  ): Promise<'created' | 'exists'>;
  /** Copies `from` into the new namespace `to` on the same node, as of `timestamp` (default now). */
  forkNamespace(
    nodeIp: string,
    from: string,
    to: string,
    timestamp?: Date,
  ): Promise<'forked' | 'exists'>;
  /** `missing` when there was nothing to delete. */
  deleteNamespace(
    nodeIp: string,
    namespace: string,
    options?: { keepBackup?: boolean },
  ): Promise<'deleted' | 'missing'>;
}

export interface SqldAdminClientOptions {
  authKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** chrono's `NaiveDateTime` format: the UTC wall clock, no offset, no `Z`. */
export function toNaiveUtc(instant: Date): string {
  return instant
    .toISOString()
    .replace(/\.\d{3}Z$/, '')
    .replace('Z', '');
}

const hostOf = (nodeIp: string): string =>
  nodeIp.includes(':') ? `[${nodeIp}]` : nodeIp;

async function errorText(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { error?: unknown }).error === 'string'
    ) {
      return (parsed as { error: string }).error;
    }
  } catch {
    // not JSON: fall through to the raw text
  }
  return text.trim().slice(0, 300) || response.statusText;
}

export function createSqldAdminClient(
  options: SqldAdminClientOptions,
): SqldAdminClient {
  if (!options.authKey || /\s/.test(options.authKey)) {
    throw new Error(
      'The sqld admin key must be non-empty and contain no whitespace',
    );
  }
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function send(
    nodeIp: string,
    method: 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<{ response: Response; message: string | null }> {
    const url = `http://${hostOf(nodeIp)}:${SQLD_ADMIN_PORT}${path}`;
    let response: Response;
    try {
      response = await doFetch(url, {
        method,
        headers: {
          authorization: `Basic ${options.authKey}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new SqldAdminError(
        `sqld admin ${method} ${path} on ${nodeIp} failed: ${error instanceof Error ? error.message : String(error)}`,
        null,
      );
    }
    const message = response.ok ? null : await errorText(response);
    return { response, message };
  }

  const fail = (
    what: string,
    nodeIp: string,
    response: Response,
    message: string | null,
  ): never => {
    throw new SqldAdminError(
      `sqld admin ${what} on ${nodeIp} answered ${response.status}: ${message}`,
      response.status,
    );
  };

  const alreadyExists = (response: Response, message: string | null) =>
    response.status === 400 && /already exists/i.test(message ?? '');

  const ns = encodeURIComponent;

  return {
    async createNamespace(nodeIp, namespace, opts = {}) {
      const body: Record<string, unknown> = {};
      if (opts.maxDbSizeBytes !== undefined) {
        body.max_db_size = Math.floor(opts.maxDbSizeBytes);
      }
      const { response, message } = await send(
        nodeIp,
        'POST',
        `/v1/namespaces/${ns(namespace)}/create`,
        body,
      );
      if (response.ok) return 'created';
      if (alreadyExists(response, message)) return 'exists';
      return fail(`create ${namespace}`, nodeIp, response, message);
    },

    async forkNamespace(nodeIp, from, to, timestamp) {
      const { response, message } = await send(
        nodeIp,
        'POST',
        `/v1/namespaces/${ns(from)}/fork/${ns(to)}`,
        timestamp === undefined
          ? undefined
          : { timestamp: toNaiveUtc(timestamp) },
      );
      if (response.ok) return 'forked';
      if (alreadyExists(response, message)) return 'exists';
      return fail(`fork ${from} to ${to}`, nodeIp, response, message);
    },

    async deleteNamespace(nodeIp, namespace, opts = {}) {
      const { response, message } = await send(
        nodeIp,
        'DELETE',
        `/v1/namespaces/${ns(namespace)}`,
        { keep_backup: opts.keepBackup === true },
      );
      if (response.ok) return 'deleted';
      if (response.status === 404) return 'missing';
      return fail(`delete ${namespace}`, nodeIp, response, message);
    },
  };
}
