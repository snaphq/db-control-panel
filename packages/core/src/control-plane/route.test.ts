import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const access = vi.hoisted(() => ({ requireProjectAccess: vi.fn() }));
vi.mock("./access", () => access);

const { withProjectControlPlane } = await import("./route");

const granted = {
  ok: true,
  access: {
    userId: "user-1",
    tenantId: "tenant-a",
    role: "owner",
    scope: { organizationId: "org-from-db", projectId: "proj-from-db" },
  },
};

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

const fetchMock = vi.fn();

describe("withProjectControlPlane", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("ALLOYDB_API_TOKEN", "token");
    vi.stubEnv("ALLOYDB_API_URL", "https://cp.test");
    access.requireProjectAccess.mockReset();
    access.requireProjectAccess.mockResolvedValue(granted);
  });

  it("does not call the control plane when access is refused", async () => {
    access.requireProjectAccess.mockResolvedValue({
      ok: false,
      status: 403,
      message: "Only workspace owners and admins can change databases.",
    });
    const response = await withProjectControlPlane(
      "proj-1",
      { write: true },
      (cp) => cp.startEndpoint("p", "ep-a-1"),
    );
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for write access only on mutations", async () => {
    fetchMock.mockResolvedValue(Response.json({ operation }));
    await withProjectControlPlane("proj-1", { write: false }, (cp) =>
      cp.getOperation("op_1"),
    );
    expect(access.requireProjectAccess).toHaveBeenCalledWith("proj-1", {
      write: false,
    });
  });

  it("sends the organization and project from the database to the control plane", async () => {
    fetchMock.mockResolvedValue(Response.json({ operation }));
    const response = await withProjectControlPlane(
      "proj-1",
      { write: false },
      (cp) => cp.getOperation("op_1"),
    );
    expect(response.status).toBe(200);
    const headers = fetchMock.mock.calls[0]?.[1]?.headers;
    expect(headers["X-AlloyDB-Org"]).toBe("org-from-db");
    expect(headers["X-AlloyDB-Project"]).toBe("proj-from-db");
  });

  it("passes the 202 status of a mutation through", async () => {
    fetchMock.mockResolvedValue(Response.json({ operation }));
    const response = await withProjectControlPlane(
      "proj-1",
      { write: true, status: 202 },
      (cp) => cp.getOperation("op_1"),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ operation });
  });

  it("maps 423 to a busy message the UI can show", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: { code: "locked", message: "x" } },
        { status: 423 },
      ),
    );
    const response = await withProjectControlPlane(
      "proj-1",
      { write: true },
      (cp) => cp.startEndpoint("p", "ep-a-1"),
    );
    expect(response.status).toBe(423);
    expect(await response.json()).toMatchObject({ code: "busy" });
  });

  it("maps control-plane outages to 502 without leaking details", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: { code: "db", message: "postgres://secret@host" } },
        { status: 500 },
      ),
    );
    const response = await withProjectControlPlane(
      "proj-1",
      { write: false },
      (cp) => cp.getOperation("op_1"),
    );
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });

  it("answers 503 when the console has no control-plane token", async () => {
    vi.stubEnv("ALLOYDB_API_TOKEN", "");
    const response = await withProjectControlPlane(
      "proj-1",
      { write: false },
      (cp) => cp.getOperation("op_1"),
    );
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
