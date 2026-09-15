import { beforeEach, describe, expect, it, vi } from "vitest";

const contexts: Array<Record<string, unknown>> = [];
const logRequest = vi.fn();
const logResponse = vi.fn();

vi.mock("@/lib/site-config", () => ({
  getSiteUrl: () => "https://test.invalid",
}));
vi.mock("@/lib/agent-auth/tokens", () => ({
  verifyAgentAccessToken: vi.fn(async () => null),
}));
vi.mock("@/lib/auth/account-token", () => ({
  verifyAccountToken: vi.fn(async () => null),
}));
vi.mock("@/lib/auth/oauth-token", () => ({
  verifyOAuthMcpToken: vi.fn(async () => null),
}));
vi.mock("@/lib/agent-auth/keys", () => ({
  AgentAuthConfigurationError: class AgentAuthConfigurationError extends Error {},
}));
vi.mock("@repo/database", () => ({
  resolveTenantFromHost: vi.fn(async () => ({ id: "tenant-a" })),
}));
vi.mock("@repo/mcp-chatgpt", () => ({
  logMcpRequest: logRequest,
  logMcpResponse: logResponse,
  runWithMcpContext: vi.fn(async (context, fn) => {
    contexts.push(context);
    return fn();
  }),
}));
vi.mock("@repo/mcp-server/widget", () => ({
  registerWidgetTools: vi.fn(),
}));
vi.mock("mcp-handler", () => ({
  createMcpHandler: vi.fn(() => vi.fn(async () => new Response("ok"))),
}));

const { POST } = await import("../app/mcp/route");
const { verifyAgentAccessToken } = await import("@/lib/agent-auth/tokens");

describe("MCP route authentication failures", () => {
  beforeEach(() => {
    contexts.length = 0;
    logRequest.mockClear();
    logResponse.mockClear();
    vi.mocked(verifyAgentAccessToken).mockResolvedValue(null);
  });

  it("returns protocol status and preserves tenant context in failure logs", async () => {
    const response = await POST(
      new Request("https://tenant.example.test/mcp", {
        method: "POST",
        headers: { host: "tenant.example.test" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "unauthorized" });
    expect(response.headers.get("www-authenticate")).toContain(
      "resource_metadata=",
    );
    expect(contexts[0]).toMatchObject({ tenantId: "tenant-a" });
    expect(logRequest).toHaveBeenCalledWith(
      expect.any(String),
      "POST",
      "/mcp",
      expect.any(Object),
    );
    expect(logResponse).toHaveBeenCalledWith(
      expect.any(String),
      401,
      expect.any(Number),
      "Bearer token required",
    );
  });

  it("distinguishes a supplied invalid bearer token", async () => {
    const response = await POST(
      new Request("https://tenant.example.test/mcp", {
        method: "POST",
        headers: {
          host: "tenant.example.test",
          authorization: "Bearer invalid-token",
        },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "invalid_token" });
    expect(logResponse).toHaveBeenCalledWith(
      expect.any(String),
      401,
      expect.any(Number),
      "Invalid bearer token",
    );
  });

  it("distinguishes unsupported authorization schemes", async () => {
    const response = await POST(
      new Request("https://tenant.example.test/mcp", {
        method: "POST",
        headers: {
          host: "tenant.example.test",
          authorization: "Basic credentials",
        },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: "unsupported_authorization_scheme",
    });
    expect(response.headers.get("www-authenticate")).not.toContain("error=");
    expect(logResponse).toHaveBeenCalledWith(
      expect.any(String),
      401,
      expect.any(Number),
      "Unsupported authorization scheme",
    );
  });

  it("returns a malformed-request error for an incomplete bearer header", async () => {
    const response = await POST(
      new Request("https://tenant.example.test/mcp", {
        method: "POST",
        headers: {
          host: "tenant.example.test",
          authorization: "Bearer",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
    expect(response.headers.get("www-authenticate")).toContain(
      'error="invalid_request"',
    );
    expect(logResponse).toHaveBeenCalledWith(
      expect.any(String),
      400,
      expect.any(Number),
      "Malformed bearer authorization header",
    );
  });
});
