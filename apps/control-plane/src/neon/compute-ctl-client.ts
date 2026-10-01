import type { Ed25519Signer } from '../crypto/ed25519.js';
import { COMPUTE_CTL_PORT } from './compute-pod.js';
import type { ComputeConfigResponse } from './spec.js';
import { mintComputeAdminToken } from './tokens.js';

/**
 * Client for compute_ctl's external HTTP API (compute_tools/src/http/server.rs).
 * Every route used here sits behind the `Authorize` middleware, which accepts a
 * token with `scope: "compute_ctl:admin"` and `aud: ["compute"]` signed by a key
 * in the JWKS the compute received (middleware/authorize.rs:84-103).
 */

export class ComputeCtlError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'ComputeCtlError';
  }
}

/** The `ComputeStatus` values compute_ctl reports (libs/compute_api/src/responses.rs:166-202, snake_case). */
export type ComputeCtlStatus =
  | 'empty'
  | 'configuration_pending'
  | 'init'
  | 'running'
  | 'configuration'
  | 'failed'
  | 'termination_pending_fast'
  | 'termination_pending_immediate'
  | 'terminated'
  | 'refresh_configuration_pending'
  | 'refresh_configuration';

export interface ComputeCtlStatusReport {
  status: ComputeCtlStatus;
  /** `last_active`: the last time a client used the compute, null until there was any. */
  lastActive: Date | null;
  error: string | null;
}

export interface ComputeCtlClient {
  status(podIp: string, computeId: string): Promise<ComputeCtlStatusReport>;
  /** Pushes a spec to a running compute and waits until it is applied (configure.rs). */
  configure(
    podIp: string,
    computeId: string,
    config: ComputeConfigResponse,
  ): Promise<void>;
  /** `POST /terminate?mode=fast`: returns once Postgres has stopped (terminate.rs). */
  terminate(podIp: string, computeId: string): Promise<void>;
}

interface ComputeCtlClientOptions {
  signer: Ed25519Signer;
  fetch?: typeof fetch;
  statusTimeoutMs?: number;
  /** `/configure` and `/terminate` block until the compute settles. */
  actionTimeoutMs?: number;
}

const baseUrl = (podIp: string): string =>
  `http://${podIp.includes(':') ? `[${podIp}]` : podIp}:${COMPUTE_CTL_PORT}`;

async function errorText(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      return String((parsed as { error: unknown }).error);
    }
  } catch {
    // plain text
  }
  return text.slice(0, 300);
}

export function createComputeCtlClient(
  options: ComputeCtlClientOptions,
): ComputeCtlClient {
  const doFetch = options.fetch ?? fetch;

  async function request(
    podIp: string,
    computeId: string,
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown; timeoutMs: number },
  ): Promise<Response> {
    const url = `${baseUrl(podIp)}${path}`;
    try {
      return await doFetch(url, {
        method: init.method,
        headers: {
          authorization: `Bearer ${mintComputeAdminToken(options.signer, computeId)}`,
          ...(init.body === undefined
            ? {}
            : { 'content-type': 'application/json' }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(init.timeoutMs),
      });
    } catch (error) {
      throw new ComputeCtlError(
        `compute_ctl ${init.method} ${url} is unreachable: ${(error as Error).message}`,
        null,
      );
    }
  }

  return {
    async status(podIp, computeId) {
      const response = await request(podIp, computeId, '/status', {
        method: 'GET',
        timeoutMs: options.statusTimeoutMs ?? 5_000,
      });
      if (!response.ok) {
        throw new ComputeCtlError(
          `compute_ctl /status returned ${response.status}: ${await errorText(response)}`,
          response.status,
        );
      }
      const body = (await response.json()) as {
        status?: string;
        last_active?: string | null;
        error?: string | null;
      };
      if (typeof body.status !== 'string') {
        throw new ComputeCtlError(
          'compute_ctl /status has no status field',
          200,
        );
      }
      const lastActive = body.last_active ? new Date(body.last_active) : null;
      return {
        status: body.status as ComputeCtlStatus,
        lastActive:
          lastActive && !Number.isNaN(lastActive.getTime()) ? lastActive : null,
        error: body.error ?? null,
      };
    },

    async configure(podIp, computeId, config) {
      // ConfigurationRequest is `{spec, compute_ctl_config}` (requests.rs:64-68).
      const response = await request(podIp, computeId, '/configure', {
        method: 'POST',
        body: {
          spec: config.spec,
          compute_ctl_config: config.compute_ctl_config,
        },
        timeoutMs: options.actionTimeoutMs ?? 120_000,
      });
      if (!response.ok) {
        throw new ComputeCtlError(
          `compute_ctl /configure returned ${response.status}: ${await errorText(response)}`,
          response.status,
        );
      }
    },

    async terminate(podIp, computeId) {
      const response = await request(podIp, computeId, '/terminate?mode=fast', {
        method: 'POST',
        timeoutMs: options.actionTimeoutMs ?? 120_000,
      });
      // 201 means it had already terminated (terminate.rs:25-30).
      if (!response.ok) {
        throw new ComputeCtlError(
          `compute_ctl /terminate returned ${response.status}: ${await errorText(response)}`,
          response.status,
        );
      }
    },
  };
}
