import "server-only";

import type { LookupAddress, LookupOptions } from "node:dns";
import { lookup } from "node:dns/promises";
import { Agent } from "undici";
import { assertSafeEndpoint, isPrivateAddress } from "./egress-policy";
import type { LoadedMCPServer } from "./mcp-runtime";

export { isPrivateAddress } from "./egress-policy";

/**
 * Minimal MCP JSON-RPC client for proxying calls to installed
 * custom-mcp-server installations.
 *
 * The custom-mcp-server provider speaks JSON-RPC 2.0 over HTTP POST,
 * with `tools/list` and `tools/call` methods (matching the MCP spec).
 */

export type MCPTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export type MCPToolResult = {
  content?: Array<{ type: string; text?: string; [k: string]: unknown }>;
  isError?: boolean;
  [k: string]: unknown;
};

type JsonRpcResponse<T> =
  | { jsonrpc: "2.0"; id: string | number; result: T }
  | {
      jsonrpc: "2.0";
      id: string | number;
      error: { code: number; message: string };
    };

const MAX_RESPONSE_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_AI_PROVIDER_RESPONSE_BYTES = 8_000_000;

export async function assertSafeMcpEndpoint(endpointUrl: string): Promise<URL> {
  return assertSafeEndpoint(endpointUrl, {
    label: "MCP endpoint",
    allowlistEnv: "MCP_PROXY_ALLOWED_HOSTS",
    // Credentials in an MCP URL query are easy to disclose through config
    // projections, logs, browser history, and redirect/error messages. MCP
    // authentication must travel in the encrypted header configuration.
    rejectQuery: true,
  });
}

/**
 * Validate an OpenAI-compatible provider endpoint before sending a server-held
 * API key. Custom providers are opt-in in production through
 * `AI_PROVIDER_ALLOWED_HOSTS`; the canonical OpenAI host remains available by
 * default. Query strings are rejected so a credential cannot be smuggled in a
 * persisted base URL and later echoed by diagnostics.
 */
export async function assertSafeAiProviderEndpoint(
  endpointUrl: string,
): Promise<URL> {
  return assertSafeEndpoint(endpointUrl, {
    label: "AI provider endpoint",
    allowlistEnv: "AI_PROVIDER_ALLOWED_HOSTS",
    defaultAllowedHosts: ["api.openai.com"],
    rejectQuery: true,
  });
}

/**
 * Resolve only public addresses at socket-connect time. The dispatcher uses
 * this callback for the actual TCP/TLS connection, preventing a DNS answer
 * checked during validation from being swapped for a private answer between
 * validation and fetch (DNS rebinding).
 */
function safeLookup(
  hostname: string,
  options: LookupOptions,
  callback: (
    error: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
): void {
  lookup(hostname, { all: true, verbatim: true })
    .then((addresses) => {
      const publicAddresses = addresses.filter(
        (entry) =>
          (entry.family === 4 || entry.family === 6) &&
          !isPrivateAddress(entry.address),
      );
      const family =
        options.family === 4 || options.family === 6
          ? options.family
          : undefined;
      const candidates = family
        ? publicAddresses.filter((entry) => entry.family === family)
        : publicAddresses;
      if (candidates.length === 0) {
        const error = Object.assign(
          new Error("MCP endpoint resolves to a private or local address"),
          { code: "EPRIVATEIP" },
        ) as NodeJS.ErrnoException;
        callback(error, "", 0);
        return;
      }
      if (options.all) {
        callback(null, candidates);
      } else {
        callback(null, candidates[0].address, candidates[0].family);
      }
    })
    .catch((error: unknown) => {
      callback(
        error instanceof Error
          ? (error as NodeJS.ErrnoException)
          : Object.assign(new Error("MCP endpoint DNS lookup failed"), {
              code: "ENOTFOUND",
            }),
        "",
        0,
      );
    });
}

/**
 * Create the dispatcher used for the actual socket connection. URL validation
 * alone is not enough: a DNS answer can change between validation and fetch.
 * Keeping this factory next to the resolver makes it harder for a caller to
 * accidentally perform an unchecked provider request.
 */
export function createSafeMcpDispatcher(): Agent {
  return new Agent({
    connect: { lookup: safeLookup },
    maxRedirections: 0,
  });
}

// A shared dispatcher keeps provider connections reusable across requests and
// applies the socket-time DNS policy to every request, not only the initial
// URL validation. It intentionally is not closed per request: the Next.js
// process owns this bounded pool for its lifetime.
const aiProviderDispatcher = createSafeMcpDispatcher();

/**
 * Fetch an OpenAI-compatible provider without following redirects or leaking
 * the configured API key to an unchecked host. Callers should bound the
 * response body with `limitResponseBody` before returning or parsing it.
 */
export async function fetchSafeAiProvider(
  endpointUrl: string,
  init: RequestInit = {},
): Promise<Response> {
  const endpoint = await assertSafeAiProviderEndpoint(endpointUrl);
  return fetch(endpoint, {
    ...init,
    redirect: "error",
    dispatcher: aiProviderDispatcher,
  } as RequestInit & { dispatcher: Agent });
}

/**
 * Cap a potentially unbounded upstream response while preserving streaming.
 * The returned body errors and cancels the upstream reader once the cap is
 * exceeded, so chunked responses cannot consume unbounded memory or runtime.
 */
export async function limitResponseBody(
  response: Response,
  maxBytes = MAX_AI_PROVIDER_RESPONSE_BYTES,
): Promise<Response> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel();
    throw new Error("Provider response is too large");
  }

  const body = response.body;
  if (!body) return response;

  const reader = body.getReader();
  let total = 0;
  const bounded = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          controller.error(new Error("Provider response is too large"));
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });

  return new Response(bounded, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export async function readLimitedResponseText(
  response: Response,
  maxBytes = MAX_AI_PROVIDER_RESPONSE_BYTES,
): Promise<string> {
  const bounded = await limitResponseBody(response, maxBytes);
  return bounded.text();
}

export function safeMcpHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const blocked = new Set([
    "cookie",
    "host",
    "origin",
    "referer",
    "content-length",
    "transfer-encoding",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "proxy-connection",
    "te",
    "trailer",
    "upgrade",
    "forwarded",
    "via",
    "x-real-ip",
    "x-client-ip",
    "true-client-ip",
    "fastly-client-ip",
    "x-cluster-client-ip",
    "x-original-forwarded-for",
  ]);
  const connectionTokens = new Set<string>();
  for (const [key, value] of Object.entries(headers)) {
    if (key.trim().toLowerCase() !== "connection") continue;
    for (const token of value.split(",")) {
      const normalized = token.trim().toLowerCase();
      if (normalized) connectionTokens.add(normalized);
    }
  }

  const out: Record<string, string> = {};
  const names = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    const normalized = key.trim().toLowerCase();
    if (
      blocked.has(normalized) ||
      connectionTokens.has(normalized) ||
      normalized.startsWith("x-forwarded-") ||
      key.length > 128 ||
      value.length > 8192 ||
      /[\r\n]/.test(value)
    ) {
      continue;
    }

    // HTTP field names are case-insensitive. Keep the last valid value so a
    // managed Authorization/X-API-Key header added after custom headers can
    // deterministically replace a conflicting casing.
    const previous = names.get(normalized);
    if (previous) delete out[previous];
    names.set(normalized, key);
    out[key] = value;
  }
  return out;
}

/** Set a managed credential header without leaving a casing-conflict behind. */
export function setManagedMcpHeader(
  headers: Record<string, string>,
  name: string,
  value: string,
): void {
  const normalized = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === normalized) delete headers[key];
  }
  headers[name] = value;
}

async function readJson<T>(response: Response): Promise<T> {
  const length = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
    throw new Error("MCP server response is too large");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("MCP server returned an empty response");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("MCP server response is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as T;
}

async function rpc<T>(
  server: LoadedMCPServer,
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const endpoint = await assertSafeMcpEndpoint(server.endpointUrl);
  const dispatcher = createSafeMcpDispatcher();
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        ...safeMcpHeaders(server.headers),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method,
        ...(params ? { params } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // Node's fetch exposes the undici dispatcher extension; the cast keeps
      // this package compatible with the standard RequestInit type.
      dispatcher,
    } as RequestInit & { dispatcher: Agent });
    if (!res.ok) {
      throw new Error(
        `MCP server '${server.displayName}' responded ${res.status} ${res.statusText}`,
      );
    }
    const payload = await readJson<JsonRpcResponse<T>>(res);
    if ("error" in payload) {
      throw new Error(
        `MCP server '${server.displayName}' error: ${payload.error.message}`,
      );
    }
    return payload.result;
  } finally {
    await dispatcher.close();
  }
}

/**
 * List tools exposed by an installed MCP server, honouring the
 * installation's toolAllowlist.
 */
export async function listTools(server: LoadedMCPServer): Promise<MCPTool[]> {
  const result = await rpc<{ tools?: MCPTool[] }>(server, "tools/list");
  const tools = result.tools ?? [];
  if (!server.toolAllowlist) return tools;
  const allowed = new Set(server.toolAllowlist);
  return tools.filter((t) => allowed.has(t.name));
}

/**
 * Invoke a tool on an installed MCP server. Throws if the tool is not
 * in the allowlist when one is configured.
 */
export async function callTool(
  server: LoadedMCPServer,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<MCPToolResult> {
  if (server.toolAllowlist && !server.toolAllowlist.includes(toolName)) {
    throw new Error(
      `Tool '${toolName}' is not in the allowlist for '${server.displayName}'.`,
    );
  }
  return rpc<MCPToolResult>(server, "tools/call", {
    name: toolName,
    arguments: args,
  });
}
