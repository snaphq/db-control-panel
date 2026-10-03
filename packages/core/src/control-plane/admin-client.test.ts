import { describe, expect, it, vi } from "vitest";
import {
  createPlatformAdminClient,
  readPlatformAdminConfig,
} from "./admin-client";
import {
  ControlPlaneConfigError,
  ControlPlaneConflictError,
  ControlPlaneNotFoundError,
  ControlPlaneUnavailableError,
} from "./errors";
import { DEFAULT_CONTROL_PLANE_URL } from "./transport";

const operation = {
  id: "op_1",
  action: "pageservers.rebalance",
  status: "running",
  failures_count: 0,
  error: null,
  params: { reason: "manual" },
  progress: { completed_steps: ["plan"], outputs: { plan: { moves: 2 } } },
  created_at: "2026-10-03T10:00:00.000Z",
  updated_at: "2026-10-03T10:00:05.000Z",
  finished_at: null,
};

const node = {
  id: 1,
  name: "hel-1",
  hostname: "hel-1",
  zone: "az-1",
  tailscale_ip: "100.64.0.1",
  roles: ["pageserver"],
  ready: true,
  missing: false,
  labels: {},
  allocatable: { cpu_millis: 8000, memory_bytes: 1, storage_bytes: null },
  pageserver: {
    registered: true,
    availability: "Active",
    scheduling: "Active",
    attached_shards: 3,
    observed_at: null,
  },
  safekeepers: [{ id: 1, state: "active" }],
  libsql_databases: 0,
  updated_at: "2026-10-03T10:00:00.000Z",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientWith(respond: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) =>
    respond(),
  );
  const client = createPlatformAdminClient({
    baseUrl: "https://cp.test",
    token: "admin-secret",
    fetch: fetchMock,
  });
  return { client, fetchMock };
}

describe("readPlatformAdminConfig", () => {
  it("reads the admin token, not the console token, and defaults the URL", () => {
    expect(
      readPlatformAdminConfig({
        ALLOYDB_ADMIN_API_TOKEN: " admin ",
        ALLOYDB_API_TOKEN: "console",
      }),
    ).toEqual({ baseUrl: DEFAULT_CONTROL_PLANE_URL, token: "admin" });
    expect(
      readPlatformAdminConfig({
        ALLOYDB_ADMIN_API_TOKEN: "t",
        ALLOYDB_API_URL: "https://cp.example/",
      }).baseUrl,
    ).toBe("https://cp.example");
  });

  it("fails fast when only the console token is set", () => {
    expect(() => readPlatformAdminConfig({ ALLOYDB_API_TOKEN: "c" })).toThrow(
      ControlPlaneConfigError,
    );
  });
});

describe("platform admin client", () => {
  it("sends the admin token and no organization or project header", async () => {
    const { client, fetchMock } = clientWith(() => json({ nodes: [node] }));
    await expect(client.listNodes()).resolves.toEqual({ nodes: [node] });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://cp.test/v1/admin/nodes");
    expect(init?.method).toBe("GET");
    expect(init?.headers).toEqual({ authorization: "Bearer admin-secret" });
  });

  it("validates the safekeeper list and layout", async () => {
    const body = {
      safekeepers: [],
      layout: {
        desired_count: 3,
        target_per_node: { "1": 1 },
        create_on_nodes: [],
        next_move: null,
        stranded: [],
        blocked: null,
      },
    };
    const { client } = clientWith(() => json(body));
    await expect(client.listSafekeepers()).resolves.toEqual(body);
    const bad = clientWith(() => json({ safekeepers: [] }));
    await expect(bad.client.listSafekeepers()).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("lists platform operations with scope=platform and filters", async () => {
    const page = { operations: [operation], next_cursor: null };
    const { client, fetchMock } = clientWith(() => json(page));
    await expect(
      client.listOperations({ status: "active", limit: 20 }),
    ).resolves.toEqual(page);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://cp.test/v1/admin/operations?scope=platform&status=active&limit=20",
    );
  });

  it("starts the two platform operations with POST", async () => {
    const { client, fetchMock } = clientWith(() => json({ operation }, 202));
    await client.rebalancePageservers();
    await client.spreadSafekeepers();
    expect(
      fetchMock.mock.calls.map(([url, init]) => [url, init?.method]),
    ).toEqual([
      ["https://cp.test/v1/admin/pageservers/rebalance", "POST"],
      ["https://cp.test/v1/admin/safekeepers/spread", "POST"],
    ]);
  });

  it("maps 409 platform_busy to a conflict error that keeps the code", async () => {
    const { client } = clientWith(() =>
      json(
        { error: { code: "platform_busy", message: "An operation is active" } },
        409,
      ),
    );
    await expect(client.rebalancePageservers()).rejects.toMatchObject({
      status: 409,
      code: "platform_busy",
      message: "An operation is active",
    });
    await expect(client.spreadSafekeepers()).rejects.toBeInstanceOf(
      ControlPlaneConflictError,
    );
  });

  it("maps 404 and rejected admin credentials", async () => {
    const missing = clientWith(() =>
      json(
        { error: { code: "not_found", message: "Operation not found" } },
        404,
      ),
    );
    await expect(missing.client.getOperation("op_1")).rejects.toBeInstanceOf(
      ControlPlaneNotFoundError,
    );
    const rejected = clientWith(() =>
      json({ error: { code: "unauthorized", message: "no" } }, 401),
    );
    await expect(rejected.client.listNodes()).rejects.toMatchObject({
      name: "ControlPlaneUnavailableError",
      status: 401,
      message: expect.stringContaining("admin portal's credentials"),
    });
  });

  it("reports an unreachable control plane", async () => {
    const { client } = clientWith(() => {
      throw new TypeError("fetch failed");
    });
    await expect(client.listNodes()).rejects.toBeInstanceOf(
      ControlPlaneUnavailableError,
    );
    await expect(client.listNodes()).rejects.toMatchObject({
      code: "unreachable",
    });
  });

  it("refuses operation ids that could change the request path", async () => {
    const { client, fetchMock } = clientWith(() => json({ operation }));
    await expect(client.getOperation("../nodes")).rejects.toMatchObject({
      code: "invalid_id",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
