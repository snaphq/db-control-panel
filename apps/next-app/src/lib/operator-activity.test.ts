import { beforeEach, describe, expect, it, vi } from "vitest";

const inserted: Array<Record<string, unknown>> = [];

vi.mock("@repo/database", () => ({
  db: () => ({
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        inserted.push(row);
      },
    }),
  }),
}));

const registeredSinks: Array<(entry: unknown) => void> = [];

vi.mock("@repo/mcp-chatgpt", () => ({
  registerMcpActivitySink: (sink: (entry: unknown) => void) => {
    registeredSinks.push(sink);
  },
}));

const { persistOperatorActivity } = await import("./operators/activity");

const operatorEntry = {
  type: "mcp_tool_response" as const,
  timestamp: "2026-09-22T00:00:00.000Z",
  requestId: "req_1",
  userId: "user_1",
  tenantId: "tenant_1",
  orgId: "org_1",
  actorId: "op_1",
  actorType: "operator",
  actorName: "Claude",
  credentialId: "cred_1",
  authMethod: "operator_credential",
  toolName: "show_content",
  toolInput: { name: "Ada" },
  toolOutput: { success: true },
  durationMs: 12,
  environment: "test",
};

describe("operator activity sink", () => {
  beforeEach(() => {
    inserted.length = 0;
    registeredSinks.length = 0;
  });

  it("persists operator entries with identity and sanitized metadata", async () => {
    await persistOperatorActivity(operatorEntry);

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      tenantId: "tenant_1",
      operatorId: "op_1",
      credentialId: "cred_1",
      userId: "user_1",
      requestId: "req_1",
      eventType: "mcp_tool_response",
      authMethod: "operator_credential",
      toolName: "show_content",
      success: true,
      metadata: {
        orgId: "org_1",
        toolInput: { name: "Ada" },
        toolOutput: { success: true },
      },
    });
    expect(typeof inserted[0]?.id).toBe("string");
  });

  it("ignores non-operator entries", async () => {
    await persistOperatorActivity({
      ...operatorEntry,
      actorType: "human",
      authMethod: "oauth",
    });
    expect(inserted).toHaveLength(0);
  });

  it("ignores entries missing the operator identity", async () => {
    await persistOperatorActivity({ ...operatorEntry, actorId: undefined });
    await persistOperatorActivity({ ...operatorEntry, userId: undefined });
    expect(inserted).toHaveLength(0);
  });

  it("derives success for response and error events", async () => {
    await persistOperatorActivity({
      ...operatorEntry,
      type: "mcp_response",
      statusCode: 500,
      toolName: undefined,
      toolInput: undefined,
      toolOutput: undefined,
    });
    await persistOperatorActivity({
      ...operatorEntry,
      type: "mcp_error",
      statusCode: undefined,
      error: "boom",
    });
    await persistOperatorActivity({
      ...operatorEntry,
      type: "mcp_tool_call",
      toolOutput: undefined,
      durationMs: undefined,
    });
    expect(inserted.map((row) => row.success)).toEqual([false, false, null]);
  });
});
