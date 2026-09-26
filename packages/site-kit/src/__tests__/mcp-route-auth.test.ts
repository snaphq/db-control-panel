import { beforeEach, describe, expect, it, vi } from "vitest";

const contexts: Array<Record<string, unknown>> = [];
const logRequest = vi.fn();
const logResponse = vi.fn();

vi.mock("@repo/core/site-config", () => ({
  getSiteUrl: () => "https://test.invalid",
}));
vi.mock("@repo/core/agent-auth/tokens", () => ({
  verifyAgentAccessToken: vi.fn(async () => null),
}));
vi.mock("@repo/core/auth/operator-token", () => ({
  verifyOperatorToken: vi.fn(async () => null),
  isLegacyAccountToken: vi.fn(() => false),
}));
vi.mock("@repo/core/auth/oauth-token", () => ({
  verifyOAuthMcpToken: vi.fn(async () => null),
}));
vi.mock("@repo/core/operators/activity", () => ({}));
vi.mock("@repo/core/agent-auth/keys", () => ({
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
vi.mock("@repo/mcp-server/site-tools", () => ({
  registerSiteTools: vi.fn(),
}));
vi.mock("mcp-handler", () => ({
  createMcpHandler: vi.fn(() => vi.fn(async () => new Response("ok"))),
}));

const { POST } = await import("@repo/site-kit/app/mcp/route");
const { createMcpHandler } = await import("mcp-handler");
const { registerSiteTools } = await import("@repo/mcp-server/site-tools");
const { siteConfig } = await import("@site/site.config");
const { verifyAgentAccessToken } = await import("@repo/core/agent-auth/tokens");
const { isLegacyAccountToken, verifyOperatorToken } = await import(
  "@repo/core/auth/operator-token"
);

describe("MCP route authentication failures", () => {
  beforeEach(() => {
    contexts.length = 0;
    logRequest.mockClear();
    logResponse.mockClear();
    vi.mocked(verifyAgentAccessToken).mockResolvedValue(null);
    vi.mocked(verifyOperatorToken).mockResolvedValue(null);
    vi.mocked(isLegacyAccountToken).mockReturnValue(false);
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

  it("returns an actionable error for retired account tokens", async () => {
    vi.mocked(isLegacyAccountToken).mockReturnValueOnce(true);

    const response = await POST(
      new Request("https://tenant.example.test/mcp", {
        method: "POST",
        headers: {
          host: "tenant.example.test",
          authorization: "Bearer cet_retired",
        },
      }),
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({ error: "invalid_token" });
    expect(body.message).toContain("operator tokens");
    expect(logResponse).toHaveBeenCalledWith(
      expect.any(String),
      401,
      expect.any(Number),
      "Retired account token",
    );
  });

  it("maps an operator credential to an operator actor context", async () => {
    vi.mocked(verifyOperatorToken).mockResolvedValueOnce({
      credentialId: "cred_1",
      operatorId: "op_1",
      operatorName: "Claude",
      userId: "user_1",
      tenantId: "tenant-a",
      scope: { mode: "organizations", organizationIds: ["org_1"] },
      organizations: [
        { id: "org_1", slug: "acme", name: "Acme", role: "owner" },
      ],
      scopes: ["api.read", "api.write"],
    });

    const response = await POST(
      new Request("https://tenant.example.test/mcp", {
        method: "POST",
        headers: {
          host: "tenant.example.test",
          authorization: "Bearer opt_test",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(contexts[0]).toMatchObject({
      actorId: "op_1",
      actorType: "operator",
      actorName: "Claude",
      authMethod: "operator_credential",
      credentialId: "cred_1",
      userId: "user_1",
      tenantId: "tenant-a",
      orgId: "org_1",
      scopes: ["api.read", "api.write"],
      operator: {
        id: "op_1",
        name: "Claude",
        organizations: [
          { id: "org_1", slug: "acme", name: "Acme", role: "owner" },
        ],
      },
    });
  });

  it("serves the site's own MCP server name and toolsets", async () => {
    vi.mocked(verifyOperatorToken).mockResolvedValueOnce({
      credentialId: "cred_1",
      operatorId: "op_1",
      operatorName: "Claude",
      userId: "user_1",
      tenantId: "tenant-a",
      scope: { mode: "all_owned" },
      organizations: [],
      scopes: ["api.read"],
    });

    await POST(
      new Request("https://site-toolsets.example.test/mcp", {
        method: "POST",
        headers: {
          host: "site-toolsets.example.test",
          authorization: "Bearer opt_test",
        },
      }),
    );

    const [init, options] = vi.mocked(createMcpHandler).mock.calls.at(-1) ?? [];
    expect(options).toMatchObject({
      serverInfo: { name: siteConfig.mcp.serverName },
    });
    await (init as (server: unknown) => Promise<void>)({});
    expect(registerSiteTools).toHaveBeenLastCalledWith(
      {},
      expect.objectContaining({
        siteName: siteConfig.name,
        toolsets: siteConfig.mcp.toolsets,
      }),
    );
  });
});
