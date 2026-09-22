import { beforeEach, describe, expect, it, vi } from "vitest";

const { logMcpRequest, registerMcpLogFallback, runWithMcpContext } =
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

describe("mcp logger fallback", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("falls back for operator entries when Axiom is not configured", async () => {
    vi.stubEnv("AXIOM_TOKEN", "");
    vi.stubEnv("AXIOM_DATASET", "");
    vi.stubEnv("AXIOM_OPERATOR_DATASET", "");
    const sink = vi.fn();
    registerMcpLogFallback(sink);

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

  it("does not fall back for non-operator entries when Axiom is off", async () => {
    vi.stubEnv("AXIOM_TOKEN", "");
    vi.stubEnv("AXIOM_DATASET", "");
    const sink = vi.fn();
    registerMcpLogFallback(sink);

    await runWithMcpContext(
      { requestId: "req_2", actorType: "human", userId: "user_1" },
      async () => {
        logMcpRequest("req_2", "POST", "/mcp", {});
      },
    );

    expect(sink).not.toHaveBeenCalled();
  });

  it("routes operator entries to the operator dataset", async () => {
    vi.stubEnv("AXIOM_TOKEN", "token");
    vi.stubEnv("AXIOM_DATASET", "shared-dataset");
    vi.stubEnv("AXIOM_OPERATOR_DATASET", "operator-dataset");
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const sink = vi.fn();
    registerMcpLogFallback(sink);

    await runWithMcpContext(operatorContext, async () => {
      logMcpRequest("req_1", "POST", "/mcp", {});
    });
    await flushAsync();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/datasets/operator-dataset/ingest"),
      expect.anything(),
    );
    expect(sink).not.toHaveBeenCalled();
  });

  it("falls back when the Axiom ingest request fails", async () => {
    vi.stubEnv("AXIOM_TOKEN", "token");
    vi.stubEnv("AXIOM_DATASET", "shared-dataset");
    vi.stubEnv("AXIOM_OPERATOR_DATASET", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const sink = vi.fn();
    registerMcpLogFallback(sink);

    await runWithMcpContext(operatorContext, async () => {
      logMcpRequest("req_1", "POST", "/mcp", {});
    });
    await flushAsync();

    expect(sink).toHaveBeenCalledTimes(1);
  });

  it("falls back when the Axiom ingest responds with an error status", async () => {
    vi.stubEnv("AXIOM_TOKEN", "token");
    vi.stubEnv("AXIOM_DATASET", "shared-dataset");
    vi.stubEnv("AXIOM_OPERATOR_DATASET", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    const sink = vi.fn();
    registerMcpLogFallback(sink);

    await runWithMcpContext(operatorContext, async () => {
      logMcpRequest("req_1", "POST", "/mcp", {});
    });
    await flushAsync();

    expect(sink).toHaveBeenCalledTimes(1);
  });
});
