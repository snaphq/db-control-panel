import { beforeEach, describe, expect, it, vi } from "vitest";

const { logMcpRequest, registerMcpActivitySink, runWithMcpContext } =
  await import("@repo/mcp-chatgpt");

const operatorContext = {
  requestId: "req_1",
  actorId: "op_1",
  actorType: "operator" as const,
  actorName: "Claude",
  credentialId: "cred_1",
  userId: "user_1",
  tenantId: "tenant_1",
  authMethod: "operator_credential" as const,
};

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("mcp logger operator activity sink", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends operator entries to the activity sink when Axiom is off", async () => {
    vi.stubEnv("AXIOM_TOKEN", "");
    vi.stubEnv("AXIOM_DATASET", "");
    vi.stubEnv("AXIOM_OPERATOR_DATASET", "");
    const sink = vi.fn();
    registerMcpActivitySink(sink);

    await runWithMcpContext(operatorContext, async () => {
      logMcpRequest("req_1", "POST", "/mcp", {});
    });

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0]).toMatchObject({
      type: "mcp_request",
      actorType: "operator",
      actorId: "op_1",
      actorName: "Claude",
      credentialId: "cred_1",
    });
  });

  it("does not send non-operator entries to the activity sink", async () => {
    vi.stubEnv("AXIOM_TOKEN", "");
    vi.stubEnv("AXIOM_DATASET", "");
    const sink = vi.fn();
    registerMcpActivitySink(sink);

    await runWithMcpContext(
      { requestId: "req_2", actorType: "human", userId: "user_1" },
      async () => {
        logMcpRequest("req_2", "POST", "/mcp", {});
      },
    );

    expect(sink).not.toHaveBeenCalled();
  });

  it("routes operator entries to the operator dataset and the sink", async () => {
    vi.stubEnv("AXIOM_TOKEN", "token");
    vi.stubEnv("AXIOM_DATASET", "shared-dataset");
    vi.stubEnv("AXIOM_OPERATOR_DATASET", "operator-dataset");
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const sink = vi.fn();
    registerMcpActivitySink(sink);

    await runWithMcpContext(operatorContext, async () => {
      logMcpRequest("req_1", "POST", "/mcp", {});
    });
    await flushAsync();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/datasets/operator-dataset/ingest"),
      expect.anything(),
    );
    // The activity sink runs in addition to Axiom, not only as a fallback.
    expect(sink).toHaveBeenCalledTimes(1);
  });

  it("writes to the sink exactly once when the Axiom ingest request fails", async () => {
    vi.stubEnv("AXIOM_TOKEN", "token");
    vi.stubEnv("AXIOM_DATASET", "shared-dataset");
    vi.stubEnv("AXIOM_OPERATOR_DATASET", "");
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);
    const sink = vi.fn();
    registerMcpActivitySink(sink);

    await runWithMcpContext(operatorContext, async () => {
      logMcpRequest("req_1", "POST", "/mcp", {});
    });
    await flushAsync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledTimes(1);
  });

  it("writes to the sink exactly once when Axiom responds with an error", async () => {
    vi.stubEnv("AXIOM_TOKEN", "token");
    vi.stubEnv("AXIOM_DATASET", "shared-dataset");
    vi.stubEnv("AXIOM_OPERATOR_DATASET", "");
    const fetchMock = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const sink = vi.fn();
    registerMcpActivitySink(sink);

    await runWithMcpContext(operatorContext, async () => {
      logMcpRequest("req_1", "POST", "/mcp", {});
    });
    await flushAsync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledTimes(1);
  });

  it("keeps sending to Axiom when the activity sink throws", async () => {
    vi.stubEnv("AXIOM_TOKEN", "token");
    vi.stubEnv("AXIOM_DATASET", "shared-dataset");
    vi.stubEnv("AXIOM_OPERATOR_DATASET", "");
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    registerMcpActivitySink(() => {
      throw new Error("db down");
    });

    await runWithMcpContext(operatorContext, async () => {
      expect(() => logMcpRequest("req_1", "POST", "/mcp", {})).not.toThrow();
    });
    await flushAsync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
