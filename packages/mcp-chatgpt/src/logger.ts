import { getCurrentMcpContext } from "./request-context";

/**
 * Structured event types emitted by the MCP logger.
 */
export type McpEventType =
  | "mcp_request"
  | "mcp_response"
  | "mcp_tool_call"
  | "mcp_tool_response"
  | "mcp_error";

export interface McpLogEntry {
  type: McpEventType;
  timestamp: string;
  requestId: string;
  userId?: string;
  orgId?: string;
  tenantId?: string;
  projectId?: string;
  actorId?: string;
  actorType?: string;
  actorName?: string;
  isAdmin?: boolean;
  credentialId?: string;
  authMethod?: string;
  // Request
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  // Tool
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  // Response
  statusCode?: number;
  durationMs?: number;
  error?: string;
  errorStack?: string;
  // Env
  environment: string;
}

/**
 * Fallback sink invoked when Axiom is not configured, or when an ingest
 * request fails. Registered by the host application (e.g. to persist operator
 * activity to the database). Sinks must be fire-and-forget and never throw.
 */
export type McpLogFallback = (entry: McpLogEntry) => void;

let logFallback: McpLogFallback | null = null;

export function registerMcpLogFallback(sink: McpLogFallback): void {
  logFallback = sink;
}

const NODE_ENV = process.env.NODE_ENV ?? "development";

/**
 * Resolve the Axiom ingest target for an entry. Operator activity can use a
 * dedicated dataset (`AXIOM_OPERATOR_DATASET`) and otherwise falls back to the
 * shared MCP dataset (`AXIOM_DATASET`). Both require `AXIOM_TOKEN`.
 */
function resolveAxiomTarget(
  entry: McpLogEntry,
): { token: string; dataset: string } | null {
  const token = process.env.AXIOM_TOKEN;
  if (!token) return null;
  if (entry.actorType === "operator") {
    const dataset =
      process.env.AXIOM_OPERATOR_DATASET ?? process.env.AXIOM_DATASET;
    return dataset ? { token, dataset } : null;
  }
  const dataset = process.env.AXIOM_DATASET;
  return dataset ? { token, dataset } : null;
}

function invokeFallback(entry: McpLogEntry): void {
  if (!logFallback) return;
  try {
    logFallback(entry);
  } catch {
    // Fallback sinks are best-effort; never let them break logging callers.
  }
}

/**
 * Send a log entry to Axiom. Fire-and-forget — never throws and never blocks
 * the request. Operator entries fall back to the registered sink when Axiom is
 * not configured or the ingest request fails.
 */
function sendToAxiom(entry: McpLogEntry): void {
  const target = resolveAxiomTarget(entry);
  if (!target) {
    if (entry.actorType === "operator") invokeFallback(entry);
    return;
  }

  const payload = [
    {
      project: {
        env: NODE_ENV,
        type: entry.actorType === "operator" ? "operator" : "mcp",
      },
      type: entry.type,
      payload: entry,
      _time: entry.timestamp,
    },
  ];

  fetch(`https://api.axiom.co/v1/datasets/${target.dataset}/ingest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${target.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
    .then((response) => {
      if (!response.ok && entry.actorType === "operator") {
        invokeFallback(entry);
      }
    })
    .catch(() => {
      // Intentionally swallowed — logging must never surface errors to
      // callers. Operator entries still reach the fallback sink.
      if (entry.actorType === "operator") invokeFallback(entry);
    });
}

/**
 * Strip sensitive header values before logging.
 */
export function sanitizeHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const sensitive = new Set([
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "api-key",
  ]);
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [
      k,
      isSensitiveHeader(k, sensitive) ? "[REDACTED]" : v,
    ]),
  );
}

function isSensitiveHeader(name: string, exact: Set<string>): boolean {
  const normalized = name.trim().toLowerCase();
  return (
    exact.has(normalized) ||
    normalized.includes("proxy-auth") ||
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.includes("password") ||
    normalized.includes("api-key")
  );
}

/**
 * Truncate large objects so Axiom payloads stay manageable.
 */
function truncate(value: unknown, maxLen = 10_000): unknown {
  if (value == null) return value;
  const str = JSON.stringify(value);
  if (str.length <= maxLen) return value;
  return {
    _truncated: true,
    _originalLength: str.length,
    _preview: `${str.slice(0, maxLen)}…`,
  };
}

function resolveRequestId(
  requestId?: string,
  ctx?: ReturnType<typeof getCurrentMcpContext>,
): string {
  return requestId ?? ctx?.requestId ?? `mcp-${Date.now()}`;
}

function serializeError(err?: Error | string): {
  error?: string;
  errorStack?: string;
} {
  if (!err) return {};
  return {
    error: typeof err === "string" ? err : err.message,
    errorStack: typeof err !== "string" ? err.stack : undefined,
  };
}

function base(
  requestId?: string,
): Pick<
  McpLogEntry,
  | "timestamp"
  | "requestId"
  | "userId"
  | "orgId"
  | "tenantId"
  | "projectId"
  | "actorId"
  | "actorType"
  | "actorName"
  | "isAdmin"
  | "credentialId"
  | "authMethod"
  | "environment"
> {
  const ctx = getCurrentMcpContext();
  return {
    timestamp: new Date().toISOString(),
    requestId: resolveRequestId(requestId, ctx),
    userId: ctx?.userId,
    orgId: ctx?.orgId,
    tenantId: ctx?.tenantId,
    projectId: ctx?.projectId,
    actorId: ctx?.actorId,
    actorType: ctx?.actorType,
    actorName: ctx?.actorName,
    isAdmin: ctx?.isAdmin,
    credentialId: ctx?.credentialId,
    authMethod: ctx?.authMethod,
    environment: NODE_ENV,
  };
}

export function logMcpRequest(
  requestId: string,
  method: string,
  path: string,
  headers: Record<string, string>,
): void {
  sendToAxiom({
    ...base(requestId),
    type: "mcp_request",
    method,
    path,
    headers: sanitizeHeaders(headers),
  });
}

export function logMcpResponse(
  requestId: string,
  statusCode: number,
  durationMs: number,
  error?: Error | string,
): void {
  sendToAxiom({
    ...base(requestId),
    type: error ? "mcp_error" : "mcp_response",
    statusCode,
    durationMs,
    ...serializeError(error),
  });
}

export function logMcpToolCall(toolName: string, toolInput: unknown): void {
  sendToAxiom({
    ...base(),
    type: "mcp_tool_call",
    toolName,
    toolInput: truncate(toolInput),
  });
}

export function logMcpToolResponse(
  toolName: string,
  toolOutput: unknown,
  durationMs: number,
  error?: Error | string,
): void {
  sendToAxiom({
    ...base(),
    type: error ? "mcp_error" : "mcp_tool_response",
    toolName,
    toolOutput: truncate(toolOutput),
    durationMs,
    ...serializeError(error),
  });
}
