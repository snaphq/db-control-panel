import "server-only";

import { db } from "@repo/database";
import { operatorActivity } from "@repo/database/schema-operators";
import { type McpLogEntry, registerMcpActivitySink } from "@repo/mcp-chatgpt";
import { nanoid } from "nanoid";

let registered = false;

/**
 * Register the database sink for operator activity. Every operator-attributed
 * event is written to `operator_activity` (powering the operator dashboard),
 * in addition to Axiom when configured. Idempotent so hot reloads cannot
 * stack duplicate sinks.
 */
export function registerOperatorActivitySink(): void {
  if (registered) return;
  registered = true;
  registerMcpActivitySink((entry) => {
    void persistOperatorActivity(entry).catch(() => {
      // Activity persistence is best-effort; never surface failures.
    });
  });
}

function deriveSuccess(entry: McpLogEntry): boolean | null {
  if (entry.type === "mcp_request" || entry.type === "mcp_tool_call") {
    return null;
  }
  if (entry.type === "mcp_tool_response") return true;
  if (entry.type === "mcp_error") return false;
  if (entry.statusCode === undefined) return null;
  return entry.statusCode < 400;
}

function buildMetadata(entry: McpLogEntry): Record<string, unknown> | null {
  const metadata: Record<string, unknown> = {};
  if (entry.orgId) metadata.orgId = entry.orgId;
  if (entry.toolInput !== undefined) metadata.toolInput = entry.toolInput;
  if (entry.toolOutput !== undefined) metadata.toolOutput = entry.toolOutput;
  return Object.keys(metadata).length > 0 ? metadata : null;
}

/**
 * Persist one operator activity event. Non-operator entries are ignored so the
 * activity table only ever contains operator-attributed activity. Returns
 * without writing when the identity required by the table is incomplete.
 */
export async function persistOperatorActivity(
  entry: McpLogEntry,
): Promise<void> {
  if (entry.actorType !== "operator") return;
  const operatorId = entry.actorId;
  const tenantId = entry.tenantId;
  const userId = entry.userId;
  if (!operatorId || !tenantId || !userId) return;

  await db()
    .insert(operatorActivity)
    .values({
      id: nanoid(),
      tenantId,
      operatorId,
      credentialId: entry.credentialId ?? null,
      userId,
      requestId: entry.requestId,
      eventType: entry.type,
      authMethod: entry.authMethod ?? null,
      toolName: entry.toolName ?? null,
      method: entry.method ?? null,
      path: entry.path ?? null,
      statusCode: entry.statusCode ?? null,
      durationMs: entry.durationMs ?? null,
      success: deriveSuccess(entry),
      error: entry.error ?? null,
      metadata: buildMetadata(entry),
    });
}

registerOperatorActivitySink();
