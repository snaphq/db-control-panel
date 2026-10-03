import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Next.js enforces the server-only marker; the test runner does not.
vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string } },
  audit: [] as Array<[unknown, string, unknown]>,
  auditFails: false,
}));

vi.mock("@/lib/admin-auth", () => ({
  getAdminSession: vi.fn(async () => state.session),
}));
vi.mock("@/lib/admin-audit", () => ({
  logAdminAction: vi.fn(
    async (actor: unknown, action: string, meta: unknown) => {
      if (state.auditFails) throw new Error("audit database down");
      state.audit.push([actor, action, meta]);
    },
  ),
}));

const { POST: rebalance } = await import(
  "@/app/api/admin/platform/pageservers/rebalance/route"
);
const { POST: spread } = await import(
  "@/app/api/admin/platform/safekeepers/spread/route"
);

const operation = {
  id: "op_1",
  action: "pageservers.rebalance",
  status: "scheduling",
  failures_count: 0,
  error: null,
  params: { reason: "manual" },
  progress: { completed_steps: [], outputs: {} },
  created_at: "2026-10-03T10:00:00.000Z",
  updated_at: "2026-10-03T10:00:00.000Z",
  finished_at: null,
};

type Call = { url: string; method: string; authorization: string | null };
const calls: Call[] = [];
let respond: (call: Call) => Response;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  state.session = { user: { id: "adm_1", email: "ops@acme.com" } };
  state.audit.length = 0;
  state.auditFails = false;
  calls.length = 0;
  respond = () => json({ operation }, 202);
  vi.stubEnv("ALLOYDB_ADMIN_API_TOKEN", "admin-secret");
  vi.stubEnv("ALLOYDB_API_TOKEN", "console-secret");
  vi.stubEnv("ALLOYDB_API_URL", "https://cp.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const call: Call = {
        url,
        method: init.method ?? "GET",
        authorization:
          (init.headers as Record<string, string>).authorization ?? null,
      };
      calls.push(call);
      return respond(call);
    }),
  );
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each([
  [
    "rebalance",
    rebalance,
    "/v1/admin/pageservers/rebalance",
    "admin_pageservers_rebalance_started",
  ],
  [
    "spread",
    spread,
    "/v1/admin/safekeepers/spread",
    "admin_safekeepers_spread_started",
  ],
] as const)("platform %s route", (_name, handler, path, auditAction) => {
  it("answers 401 without an admin session and never calls the control plane", async () => {
    state.session = null;
    const response = await handler();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(calls).toHaveLength(0);
    expect(state.audit).toHaveLength(0);
  });

  it("answers 401 for a session that carries no admin user", async () => {
    state.session = { user: { id: "", email: "x@y.z" } };
    expect((await handler()).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("starts the operation with the admin token, audits it and answers 202", async () => {
    const response = await handler();
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ operation });
    expect(calls).toEqual([
      {
        url: `https://cp.test${path}`,
        method: "POST",
        authorization: "Bearer admin-secret",
      },
    ]);
    expect(state.audit).toEqual([
      [
        { id: "adm_1" },
        auditAction,
        { operation_id: "op_1", action: "pageservers.rebalance" },
      ],
    ]);
  });

  it("still answers 202 when the audit write fails after the operation started", async () => {
    state.auditFails = true;
    const response = await handler();
    expect(response.status).toBe(202);
    expect(console.error).toHaveBeenCalled();
  });

  it("maps 409 platform_busy and names the active operation", async () => {
    respond = (call) =>
      call.method === "POST"
        ? json({ error: { code: "platform_busy", message: "busy" } }, 409)
        : json({
            operations: [{ ...operation, id: "op_active", status: "running" }],
            next_cursor: null,
          });
    const response = await handler();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "platform_busy",
      active_operation_id: "op_active",
    });
    expect(calls.map((c) => c.url)).toEqual([
      `https://cp.test${path}`,
      "https://cp.test/v1/admin/operations?scope=platform&status=active&limit=1",
    ]);
    expect(state.audit).toHaveLength(0);
  });

  it("answers 409 platform_busy even when the active operation cannot be looked up", async () => {
    respond = (call) =>
      call.method === "POST"
        ? json({ error: { code: "platform_busy", message: "busy" } }, 409)
        : json({ error: { code: "x", message: "down" } }, 500);
    const response = await handler();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "platform_busy",
      active_operation_id: null,
    });
  });

  it("answers 503 when ALLOYDB_ADMIN_API_TOKEN is not set, even with the console token", async () => {
    vi.stubEnv("ALLOYDB_ADMIN_API_TOKEN", "");
    const response = await handler();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "not_configured" });
    expect(calls).toHaveLength(0);
  });

  it("answers 502 when the control plane is unreachable or refuses the token", async () => {
    respond = () =>
      json({ error: { code: "unauthorized", message: "no" } }, 401);
    expect((await handler()).status).toBe(502);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect((await handler()).status).toBe(502);
    expect(state.audit).toHaveLength(0);
  });
});
