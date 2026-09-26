import { beforeEach, describe, expect, it, vi } from "vitest";

// Next.js enforces the server-only marker; the test runner does not.
vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string } },
  tenantRows: [] as Array<{ id: string }>,
  contexts: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/admin-auth", () => ({
  getAdminSession: vi.fn(async () => state.session),
}));
vi.mock("@repo/database", async (importOriginal) => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: async () => state.tenantRows,
  };
  return {
    ...(await importOriginal<typeof import("@repo/database")>()),
    db: () => chain,
  };
});
vi.mock("@repo/mcp-chatgpt", () => ({
  getCurrentMcpContext: vi.fn(),
  logMcpRequest: vi.fn(),
  logMcpResponse: vi.fn(),
  runWithMcpContext: vi.fn(async (context, fn) => {
    state.contexts.push(context);
    return fn();
  }),
}));
vi.mock("@repo/mcp-server/admin", () => ({ registerAdminTools: vi.fn() }));
vi.mock("mcp-handler", () => ({
  createMcpHandler: vi.fn(() => vi.fn(async () => new Response("ok"))),
}));

const { POST } = await import("@/app/mcp/route");

function post(query = ""): Promise<Response> {
  return POST(
    new Request(`https://admin.example/mcp${query}`, {
      method: "POST",
      headers: { host: "admin.example" },
    }),
  );
}

describe("backend admin MCP endpoint", () => {
  beforeEach(() => {
    state.session = { user: { id: "adm_1", email: "ops@acme.com" } };
    state.tenantRows = [{ id: "site-b" }];
    state.contexts.length = 0;
  });

  it("requires the caller to name a tenant", async () => {
    const response = await post();
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
  });

  it("requires a backend admin session", async () => {
    state.session = null;
    const response = await post("?tenant=site-b");
    expect(response.status).toBe(401);
  });

  it("rejects tenants that do not exist", async () => {
    state.tenantRows = [];
    const response = await post("?tenant=nope");
    expect(response.status).toBe(404);
  });

  it("binds admin tools to exactly the requested tenant", async () => {
    const response = await post("?tenant=site-b");
    expect(response.status).toBe(200);
    expect(state.contexts[0]).toMatchObject({
      tenantId: "site-b",
      isAdmin: true,
      actorId: "adm_1",
      authMethod: "session",
    });
  });
});
