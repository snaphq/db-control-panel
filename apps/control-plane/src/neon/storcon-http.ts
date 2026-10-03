import type { z } from 'zod';

/**
 * HTTP transport shared by the storage-controller clients (`storcon-client.ts`
 * for the project flows, `storcon-admin.ts` for platform operations): bearer
 * token, retries with backoff on transient statuses, and JSON validation.
 * Every call carries the admin-scoped token, which `check_permissions` accepts
 * for every route used (storage_controller/src/http.rs:1811-1821: the required
 * scope, or `admin`).
 */

export class StorconError extends Error {
  constructor(
    message: string,
    readonly method: string,
    readonly path: string,
    /** HTTP status, or null when the request never got a response. */
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'StorconError';
  }
}

interface RetryOptions {
  /** Total tries, including the first. */
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface StorconClientOptions {
  baseUrl: string;
  /** Admin-scoped Neon token (`CONTROL_PLANE_JWT_TOKEN`). */
  token: string;
  fetch?: typeof fetch;
  retry?: Partial<RetryOptions>;
  requestTimeoutMs?: number;
  /** Test hook: replaces the backoff sleep. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_RETRY: RetryOptions = {
  attempts: 5,
  baseDelayMs: 250,
  maxDelayMs: 5_000,
};
const DEFAULT_TIMEOUT_MS = 30_000;

/** Statuses worth another try: the controller is starting, busy or behind a proxy. */
const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([429, 502, 503, 504]);

export interface RequestSpec {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  /** Statuses that mean success. */
  ok: readonly number[];
  /** Statuses that also mean "done" and are not an error (e.g. 404 on delete). */
  done?: readonly number[];
  /** Extra statuses to retry (deletes answer 202/409 while still in progress). */
  retryOn?: readonly number[];
  timeoutMs?: number;
  /** Total tries for this call, replacing the client default (1 = never retry). */
  attempts?: number;
}

export interface StorconTransport {
  /** Sends the request and returns the body of a success (or `done`) response. */
  call(spec: RequestSpec): Promise<string>;
  callJson<T>(
    spec: RequestSpec,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<T>;
}

/** The controller reports errors as `{"msg": "..."}` (libs/utils HttpErrorBody). */
function errorDetail(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 'msg' in parsed) {
      return String((parsed as { msg: unknown }).msg);
    }
  } catch {
    // not JSON; fall through to the raw text
  }
  return text.slice(0, 500);
}

export function createStorconTransport(
  options: StorconClientOptions,
): StorconTransport {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const doFetch = options.fetch ?? fetch;
  const retry: RetryOptions = { ...DEFAULT_RETRY, ...options.retry };
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  const backoff = (attempt: number, retryAfterSeconds: number | null) => {
    const exponential = Math.min(
      retry.maxDelayMs,
      retry.baseDelayMs * 2 ** (attempt - 1),
    );
    if (retryAfterSeconds !== null) {
      return Math.min(retry.maxDelayMs, retryAfterSeconds * 1000);
    }
    return Math.round(exponential / 2 + Math.random() * (exponential / 2));
  };

  /** Runs one request with retries; resolves to the final response status and text. */
  async function send(
    spec: RequestSpec,
  ): Promise<{ status: number; text: string }> {
    const url = `${baseUrl}${spec.path}`;
    const attempts = spec.attempts ?? retry.attempts;
    let lastFailure = '';
    let lastStatus: number | null = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      let retryAfter: number | null = null;
      try {
        const response = await doFetch(url, {
          method: spec.method,
          headers: {
            authorization: `Bearer ${options.token}`,
            ...(spec.body === undefined
              ? {}
              : { 'content-type': 'application/json' }),
          },
          body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
          signal: AbortSignal.timeout(
            spec.timeoutMs ?? options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS,
          ),
        });
        const text = await response.text();
        const retryable =
          TRANSIENT_STATUSES.has(response.status) ||
          (spec.retryOn?.includes(response.status) ?? false);
        if (!retryable) return { status: response.status, text };
        lastStatus = response.status;
        lastFailure = `${response.status} ${errorDetail(text)}`;
        const header = Number(response.headers.get('retry-after'));
        retryAfter = Number.isFinite(header) && header > 0 ? header : null;
      } catch (error) {
        // Connection refused while the controller restarts, or a timeout.
        lastStatus = null;
        lastFailure = (error as Error).message;
      }
      if (attempt < attempts) await sleep(backoff(attempt, retryAfter));
    }
    throw new StorconError(
      `Storage controller ${spec.method} ${spec.path} still failing after ${attempts} attempts: ${lastFailure}`,
      spec.method,
      spec.path,
      lastStatus,
    );
  }

  async function call(spec: RequestSpec): Promise<string> {
    const { status, text } = await send(spec);
    if (spec.ok.includes(status) || spec.done?.includes(status)) return text;
    throw new StorconError(
      `Storage controller ${spec.method} ${spec.path} returned ${status}: ${errorDetail(text)}`,
      spec.method,
      spec.path,
      status,
    );
  }

  async function callJson<T>(
    spec: RequestSpec,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<T> {
    const text = await call(spec);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new StorconError(
        `Storage controller ${spec.method} ${spec.path} returned non-JSON: ${text.slice(0, 200)}`,
        spec.method,
        spec.path,
        200,
      );
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new StorconError(
        `Storage controller ${spec.method} ${spec.path} returned an unexpected body: ${result.error.message}`,
        spec.method,
        spec.path,
        200,
      );
    }
    return result.data;
  }

  return { call, callJson };
}
