import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CONTROL_PLANE_URL,
  createControlPlaneClient,
  readControlPlaneConfig,
} from "./client";
import {
  ControlPlaneBusyError,
  ControlPlaneConfigError,
  ControlPlaneNotFoundError,
  ControlPlaneRequestError,
  ControlPlaneUnavailableError,
} from "./errors";

const scope = { organizationId: "org_1", projectId: "proj_1" };
const operation = {
  id: "op_1",
  target_type: "endpoint",
  target_id: "ep-a-1",
  action: "endpoint.start",
  status: "running",
  failures_count: 0,
  error: null,
  created_at: "2026-01-01T00:00:00.000Z",
  finished_at: null,
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
  const client = createControlPlaneClient(
    { baseUrl: "https://cp.test", token: "secret", fetch: fetchMock },
    scope,
  );
  return { client, fetchMock };
}

describe("readControlPlaneConfig", () => {
  it("defaults the base URL and trims trailing slashes", () => {
    expect(readControlPlaneConfig({ ALLOYDB_API_TOKEN: "t" })).toEqual({
      baseUrl: DEFAULT_CONTROL_PLANE_URL,
      token: "t",
    });
    expect(
      readControlPlaneConfig({
        ALLOYDB_API_TOKEN: "t",
        ALLOYDB_API_URL: "https://cp.example/",
      }).baseUrl,
    ).toBe("https://cp.example");
  });

  it("fails fast when the token is missing", () => {
    expect(() => readControlPlaneConfig({})).toThrow(ControlPlaneConfigError);
  });
});

describe("control-plane client", () => {
  it("sends the bearer token and the scope headers", async () => {
    const { client, fetchMock } = clientWith(() =>
      json({ endpoint: undefined, operation }, 202),
    );
    await client.startEndpoint("proj_x", "ep-a-1").catch(() => undefined);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://cp.test/v1/projects/proj_x/endpoints/ep-a-1/start",
    );
    const headers = init?.headers as Record<string, string>;
    expect(init?.method).toBe("POST");
    expect(headers.authorization).toBe("Bearer secret");
    expect(headers["X-AlloyDB-Org"]).toBe("org_1");
    expect(headers["X-AlloyDB-Project"]).toBe("proj_1");
  });

  it("parses a valid response with the contract schema", async () => {
    const { client } = clientWith(() => json({ operation }));
    await expect(client.getOperation("op_1")).resolves.toEqual({ operation });
  });

  it("rejects a response that does not match the contract", async () => {
    const { client } = clientWith(() => json({ operation: { id: 1 } }));
    await expect(client.getOperation("op_1")).rejects.toMatchObject({
      name: "ControlPlaneUnavailableError",
      code: "invalid_response",
    });
  });

  it("maps 423 to a busy error", async () => {
    const { client } = clientWith(() =>
      json({ error: { code: "locked", message: "busy" } }, 423),
    );
    await expect(client.getOperation("op_1")).rejects.toBeInstanceOf(
      ControlPlaneBusyError,
    );
  });

  it("maps 404 to a not-found error", async () => {
    const { client } = clientWith(() =>
      json({ error: { code: "not_found", message: "No such operation" } }, 404),
    );
    await expect(client.getOperation("op_1")).rejects.toBeInstanceOf(
      ControlPlaneNotFoundError,
    );
  });

  it("maps validation failures to a request error that keeps the message", async () => {
    const { client } = clientWith(() =>
      json({ error: { code: "conflict", message: "Branch exists" } }, 409),
    );
    await expect(
      client.createBranch("proj_x", { name: "dev" }),
    ).rejects.toMatchObject({
      name: "ControlPlaneRequestError",
      status: 409,
      message: "Branch exists",
    });
  });

  it("maps 5xx, rejected credentials and network failures to unavailable", async () => {
    for (const status of [500, 503, 401]) {
      const { client } = clientWith(() =>
        json({ error: { code: "x", message: "boom" } }, status),
      );
      await expect(client.getOperation("op_1")).rejects.toBeInstanceOf(
        ControlPlaneUnavailableError,
      );
    }
    const { client } = clientWith(() => {
      throw new TypeError("fetch failed");
    });
    await expect(client.getOperation("op_1")).rejects.toMatchObject({
      name: "ControlPlaneUnavailableError",
      code: "unreachable",
    });
  });

  it("refuses identifiers that could change the request path", async () => {
    const { client, fetchMock } = clientWith(() => json({ operation }));
    for (const id of ["..", "../operations", "a/b", "", ".hidden"]) {
      await expect(client.getOperation(id)).rejects.toBeInstanceOf(
        ControlPlaneRequestError,
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("toggles the Data API with PUT and DELETE", async () => {
    const { client, fetchMock } = clientWith(() => json({}, 500));
    await client.setDataApi("p", "b", "neondb", true).catch(() => undefined);
    await client.setDataApi("p", "b", "neondb", false).catch(() => undefined);
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual([
      "PUT",
      "DELETE",
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://cp.test/v1/projects/p/branches/b/databases/neondb/data_api",
    );
  });
});
