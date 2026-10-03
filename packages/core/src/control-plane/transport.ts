import "server-only";
import { errorResponseSchema } from "@repo/control-plane-contract";
import type { ZodType, ZodTypeDef } from "zod";
import {
  ControlPlaneBusyError,
  ControlPlaneConflictError,
  type ControlPlaneError,
  ControlPlaneNotFoundError,
  ControlPlaneRequestError,
  ControlPlaneUnavailableError,
} from "./errors";

/**
 * The HTTP layer both control-plane clients share: the console's scoped client
 * (`client.ts`, `ALLOYDB_API_TOKEN`) and the platform admin client
 * (`admin-client.ts`, `ALLOYDB_ADMIN_API_TOKEN`). It differs only in the token
 * and the extra headers, so errors and response validation stay identical.
 */

export const DEFAULT_CONTROL_PLANE_URL = "https://api.alloydb.net";
const REQUEST_TIMEOUT_MS = 15_000;

type Method = "GET" | "POST" | "PUT" | "DELETE";
type Schema<T> = ZodType<T, ZodTypeDef, unknown>;

export interface TransportConfig {
  baseUrl: string;
  token: string;
  /** Replaceable for tests. */
  fetch?: typeof fetch;
}

/** `ALLOYDB_API_URL` (default https://api.alloydb.net) without trailing slashes. */
export function readBaseUrl(env: Record<string, string | undefined>): string {
  return (env.ALLOYDB_API_URL?.trim() || DEFAULT_CONTROL_PLANE_URL).replace(
    /\/+$/,
    "",
  );
}

const SAFE_SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,127}$/;

/** Encodes one path segment; refuses anything that could climb out of it. */
export function pathSegment(value: string): string {
  if (!SAFE_SEGMENT.test(value)) {
    throw new ControlPlaneRequestError(
      "That identifier is not valid.",
      400,
      "invalid_id",
    );
  }
  return encodeURIComponent(value);
}

/** `?status=active&limit=20`, or nothing; parameters left undefined are dropped. */
export function queryString(
  query: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

async function errorFrom(
  response: Response,
  rejectedMessage: string,
): Promise<ControlPlaneError> {
  const parsed = errorResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  const code = parsed.success ? parsed.data.error.code : "unknown";
  const message = parsed.success
    ? parsed.data.error.message
    : `Control plane answered ${response.status}`;
  const { status } = response;
  if (status === 423) return new ControlPlaneBusyError(message);
  if (status === 404) return new ControlPlaneNotFoundError(message, code);
  if (status === 409) return new ControlPlaneConflictError(message, code);
  if (status === 401 || status === 403) {
    // Our own token was refused: an operator problem, not the user's.
    return new ControlPlaneUnavailableError(rejectedMessage, status, code);
  }
  if (status >= 500) {
    return new ControlPlaneUnavailableError(message, status, code);
  }
  return new ControlPlaneRequestError(message, status, code);
}

/**
 * Returns `request(schema, method, path, body)`: calls `<baseUrl>/v1<path>`
 * with the bearer token plus `headers`, throws the typed errors of
 * `errors.ts`, and returns the body validated by `schema`.
 * `rejectedMessage` is what 401/403 become, naming whose credentials failed.
 */
export function createTransport(
  config: TransportConfig,
  options: { headers?: Record<string, string>; rejectedMessage: string },
) {
  const doFetch = config.fetch ?? fetch;

  return async function request<T>(
    schema: Schema<T>,
    method: Method,
    path: string,
    body?: unknown,
  ): Promise<T> {
    let response: Response;
    try {
      response = await doFetch(`${config.baseUrl}/v1${path}`, {
        method,
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          authorization: `Bearer ${config.token}`,
          ...options.headers,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      throw new ControlPlaneUnavailableError(
        `The AlloyDB control plane is unreachable: ${cause instanceof Error ? cause.message : String(cause)}`,
        0,
        "unreachable",
      );
    }
    if (!response.ok) throw await errorFrom(response, options.rejectedMessage);
    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new ControlPlaneUnavailableError(
        "The AlloyDB control plane sent a response the console does not understand.",
        response.status,
        "invalid_response",
      );
    }
    return parsed.data;
  };
}
