import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Authorization of the Databases API routes. The real routes and the real
 * @repo/core control-plane code run; only the session, the tenant lookup, the
 * membership row and the control plane's HTTP endpoint are faked.
 */

vi.mock("server-only", () => ({}));

const session = { current: { user: { id: "user-1" } } as unknown };
const membership = { current: [] as unknown[] };

function queryChain(): unknown {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "then") {
          return (resolve: (value: unknown) => void) =>
            resolve(membership.current);
        }
        return () => queryChain();
      },
    },
  );
}

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "console.example" }),
}));
vi.mock("@repo/auth/server", () => ({
  auth: { api: { getSession: async () => session.current } },
}));
vi.mock("@repo/database", async () => {
  const drizzle = await import("drizzle-orm");
  return {
    and: drizzle.and,
    eq: drizzle.eq,
    db: () => queryChain(),
    resolveTenantFromHost: async () => ({ id: "tenant-a" }),
  };
});

const fetchMock = vi.fn();

const operation = {
  id: "op_1",
  target_type: "branch",
  target_id: "br_1",
  action: "branch.create",
  status: "running",
  failures_count: 0,
  error: null,
  created_at: "2026-01-01T00:00:00.000Z",
  finished_at: null,
};

const branch = {
  id: "br_1",
  project_id: "proj_1",
  name: "dev",
  parent_id: null,
  parent_lsn: null,
  is_default: false,
  created_at: "2026-01-01T00:00:00.000Z",
};
const endpoint = {
  id: "ep-a-1",
  project_id: "proj_1",
  branch_id: "br_1",
  type: "read_write",
  compute_size: "1",
  suspend_timeout_seconds: 300,
  state: "starting",
  host: "ep-a-1.pg.alloydb.net",
  last_active_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

/** A control plane that answers each route with a contract-shaped body. */
async function controlPlane(url: string, init?: { method?: string }) {
  const path = new URL(url).pathname;
  const accepted = { status: 202 };
  if (path.includes("/operations/")) return Response.json({ operation });
  if (path.endsWith("/operations")) {
    return Response.json({ operations: [operation], next_cursor: null });
  }
  if (path.endsWith("/branches")) {
    return Response.json({ branch, endpoints: [], operation }, accepted);
  }
  if (path.includes("/endpoints/")) {
    return Response.json({ endpoint, operation }, accepted);
  }
  if (init?.method === "GET") {
    return Response.json({ projects: [], libsql_databases: [] });
  }
  return Response.json({ operation }, accepted);
}

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

const base = "../app/api/projects/[id]/databases";
const params = {
  id: "console-project",
  opId: "op_1",
  neonId: "proj_1",
  branchId: "br_1",
  endpointId: "ep-a-1",
  role: "neondb_owner",
  db: "neondb",
  dbId: "lsql_1",
};

const mutations: Array<{
  name: string;
  load: () => Promise<Record<string, Handler>>;
  method: string;
  body?: unknown;
}> = [
  {
    name: "create Postgres project",
    load: () => import(`${base}/route`),
    method: "POST",
    body: { name: "app" },
  },
  {
    name: "delete Postgres project",
    load: () => import(`${base}/neon/[neonId]/route`),
    method: "DELETE",
  },
  {
    name: "create branch",
    load: () => import(`${base}/neon/[neonId]/branches/route`),
    method: "POST",
    body: { name: "dev" },
  },
  {
    name: "delete branch",
    load: () => import(`${base}/neon/[neonId]/branches/[branchId]/route`),
    method: "DELETE",
  },
  {
    name: "start endpoint",
    load: () =>
      import(`${base}/neon/[neonId]/endpoints/[endpointId]/start/route`),
    method: "POST",
  },
  {
    name: "suspend endpoint",
    load: () =>
      import(`${base}/neon/[neonId]/endpoints/[endpointId]/suspend/route`),
    method: "POST",
  },
  {
    name: "reset role password",
    load: () =>
      import(
        `${base}/neon/[neonId]/branches/[branchId]/roles/[role]/reset-password/route`
      ),
    method: "POST",
  },
  {
    name: "enable Data API",
    load: () =>
      import(
        `${base}/neon/[neonId]/branches/[branchId]/databases/[db]/data-api/route`
      ),
    method: "PUT",
  },
  {
    name: "disable Data API",
    load: () =>
      import(
        `${base}/neon/[neonId]/branches/[branchId]/databases/[db]/data-api/route`
      ),
    method: "DELETE",
  },
  {
    name: "create libSQL database",
    load: () => import(`${base}/libsql/route`),
    method: "POST",
    body: { name: "notes" },
  },
  {
    name: "delete libSQL database",
    load: () => import(`${base}/libsql/[dbId]/route`),
    method: "DELETE",
  },
  {
    name: "issue libSQL token",
    load: () => import(`${base}/libsql/[dbId]/tokens/route`),
    method: "POST",
    body: {},
  },
];

const reads = [
  {
    name: "list databases",
    load: () => import(`${base}/route`),
  },
  {
    name: "read operation",
    load: () => import("../app/api/projects/[id]/operations/[opId]/route"),
  },
  {
    name: "list operations",
    load: () => import("../app/api/projects/[id]/operations/route"),
  },
];

function call(
  handlers: Record<string, Handler>,
  method: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
  url = "https://console.example/api",
) {
  const handler = handlers[method];
  if (!handler) throw new Error(`No ${method} handler`);
  return handler(
    new Request(url, {
      method,
      headers: { "content-type": "application/json", ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve(params) },
  );
}

const row = (role: string) => [
  { organizationId: "org-from-db", projectId: "console-project", role },
];

describe("database routes authorization", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(controlPlane);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("ALLOYDB_API_TOKEN", "token");
    vi.stubEnv("ALLOYDB_API_URL", "https://cp.test");
    session.current = { user: { id: "user-1" } };
    membership.current = row("owner");
  });

  describe.each([...mutations, ...reads.map((r) => ({ ...r, method: "GET" }))])(
    "$name",
    (route) => {
      it("answers 401 without a session and never reaches the control plane", async () => {
        session.current = null;
        const handlers = await route.load();
        const response = await call(
          handlers,
          route.method,
          "body" in route ? route.body : undefined,
        );
        expect(response.status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
      });

      it("answers 404 for a member of another organization", async () => {
        membership.current = []; // the membership join finds no row
        const handlers = await route.load();
        const response = await call(
          handlers,
          route.method,
          "body" in route ? route.body : undefined,
        );
        expect(response.status).toBe(404);
        expect(fetchMock).not.toHaveBeenCalled();
      });
    },
  );

  describe.each(mutations)("$name", (route) => {
    it("refuses a workspace member who is not an owner or admin", async () => {
      membership.current = row("member");
      const handlers = await route.load();
      const response = await call(handlers, route.method, route.body);
      expect(response.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it.each(reads)("$name is open to any member", async (route) => {
    membership.current = row("member");
    const handlers = await route.load();
    const response = await call(handlers, "GET");
    expect(response.status).toBe(200);
  });

  it("scopes the control-plane call to the database's organization, not the request's", async () => {
    const handlers = await import(`${base}/neon/[neonId]/branches/route`);
    const response = await call(
      handlers,
      "POST",
      { name: "dev", organization_id: "org-evil" },
      { "X-AlloyDB-Org": "org-evil", "X-AlloyDB-Project": "other-project" },
    );
    expect(response.status).toBe(202);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://cp.test/v1/projects/proj_1/branches");
    expect(init.headers["X-AlloyDB-Org"]).toBe("org-from-db");
    expect(init.headers["X-AlloyDB-Project"]).toBe("console-project");
    expect(JSON.parse(init.body)).toEqual({ name: "dev" });
  });

  it("lets an admin change databases", async () => {
    membership.current = row("admin");
    const handlers = await import(
      `${base}/neon/[neonId]/endpoints/[endpointId]/start/route`
    );
    const response = await call(handlers, "POST");
    expect(response.status).toBe(202);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://cp.test/v1/projects/proj_1/endpoints/ep-a-1/start",
    );
  });

  it("rejects an invalid body with 400 before calling the control plane", async () => {
    const handlers = await import(`${base}/neon/[neonId]/branches/route`);
    const response = await call(handlers, "POST", { name: "" });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tells the UI when another change is in progress", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: { code: "locked", message: "x" } },
        { status: 423 },
      ),
    );
    const handlers = await import(`${base}/neon/[neonId]/route`);
    const response = await call(handlers, "DELETE");
    expect(response.status).toBe(423);
    expect(await response.json()).toMatchObject({ code: "busy" });
  });

  describe("list operations", () => {
    // Loaded by a computed path, like the other routes: its params are the shared `params` bag.
    const load = (): Promise<Record<string, Handler>> =>
      import(`${base}/../operations/route`);
    const list = async (query: string) =>
      call(
        await load(),
        "GET",
        undefined,
        {},
        `https://console.example/api/projects/console-project/operations${query}`,
      );

    it("asks the control plane for active operations, scoped by the database's ids", async () => {
      const response = await list("?status=active");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        operations: [operation],
        next_cursor: null,
      });
      const [url, init] = fetchMock.mock.calls[0] ?? [];
      expect(url).toBe("https://cp.test/v1/operations?status=active&limit=50");
      expect(init.method).toBe("GET");
      expect(init.headers["X-AlloyDB-Org"]).toBe("org-from-db");
      expect(init.headers["X-AlloyDB-Project"]).toBe("console-project");
    });

    it("forwards the page size and cursor", async () => {
      await list("?limit=5&cursor=op_9");
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        "https://cp.test/v1/operations?limit=5&cursor=op_9",
      );
    });

    it("rejects an unknown status or page size before calling the control plane", async () => {
      for (const query of ["?status=pending", "?limit=0", "?limit=1000"]) {
        const response = await list(query);
        expect(response.status, query).toBe(400);
        expect(await response.json()).toMatchObject({
          code: "invalid_request",
        });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
