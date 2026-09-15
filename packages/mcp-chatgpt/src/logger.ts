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

interface McpLogEntry {
  type: McpEventType;
  timestamp: string;
  requestId: string;
  userId?: string;
  orgId?: string;
  tenantId?: string;
  projectId?: string;
  actorId?: string;
  actorType?: string;
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

const NODE_ENV = process.env.NODE_ENV ?? "development";

/**
 * Returns true only when both AXIOM_TOKEN and AXIOM_DATASET are set.
 * Logging silently no-ops when either is absent.
 */
function isAxiomEnabled(): boolean {
  return !!(process.env.AXIOM_TOKEN && process.env.AXIOM_DATASET);
}

/**
 * Send a log entry to Axiom. Fire-and-forget — never throws and never
 * blocks the request.
 */
function sendToAxiom(entry: McpLogEntry): void {
  if (!isAxiomEnabled()) return;

  const token = process.env.AXIOM_TOKEN as string;
  const dataset = process.env.AXIOM_DATASET as string;

  const payload = [
    {
      project: { env: NODE_ENV, type: "mcp" },
      type: entry.type,
      payload: entry,
      _time: entry.timestamp,
    },
  ];

  fetch(`https://api.axiom.co/v1/datasets/${dataset}/ingest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Intentionally swallowed — logging must never surface errors to callers
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
