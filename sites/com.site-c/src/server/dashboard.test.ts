import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tenant binding for the server functions the dashboard pages read through.
 *
 * These replaced the HTTP endpoints the pages used to call: server-side fetch
 * of a relative URL is invalid in Node, so pages now call these directly. The
 * rule under test is unchanged — the tenant comes from the Host header of the
 * ambient request and is never accepted as an argument, so a client cannot
 * name another tenant.
 *
 * The query layer is mocked out rather than the database: this suite pins how
 * dashboard.ts resolves a tenant and what it passes down. That the queries
 * scope by the tenant they are given is covered in src/server/queries.test.ts.
 */

const tenantsByHost: Record<
  string,
  { id: string; slug: string; name: string; status: string }
> = {
  "starter-solid-stack.vercel.app": {
    id: "site-c",
    slug: "site-c",
    name: "Site C",
    status: "active",
  },
  "site-a.example": {
    id: "default",
    slug: "default",
    name: "Site A",
    status: "active",
  },
};

const resolveTenantFromHost = vi.hoisted(() =>
  vi.fn(async (host: string | null) =>
    host ? (tenantsByHost[host] ?? null) : null,
  ),
);

vi.mock("@repo/database", () => ({ resolveTenantFromHost }));

const getOverview = vi.hoisted(() =>
  vi.fn(async () => ({ marker: "overview" })),
);
const getLogs = vi.hoisted(() => vi.fn(async () => ({ marker: "logs" })));
const getGo = vi.hoisted(() => vi.fn(async () => ({ marker: "go" })));

vi.mock("./queries", () => ({ getOverview, getLogs, getGo }));

type Eventish = { request: Request };
let currentRequest: Request | null = null;

vi.mock("solid-js/web", async () => {
  const actual =
    await vi.importActual<typeof import("solid-js/web")>("solid-js/web");
  return {
    ...actual,
    getRequestEvent: () =>
      currentRequest ? ({ request: currentRequest } as never) : undefined,
  };
});

const { tenantInfo, overviewData, logsData, goData } = await import(
  "./dashboard"
);

function serveFrom(host: string | null) {
  currentRequest = new Request(`https://${host ?? "no-host"}/`, {
    headers: host ? { host } : {},
  });
}

beforeEach(() => {
  currentRequest = null;
  getOverview.mockClear();
  getLogs.mockClear();
  getGo.mockClear();
});

describe("dashboard server functions", () => {
  it("binds the production host to its own tenant", async () => {
    serveFrom("starter-solid-stack.vercel.app");
    expect(await tenantInfo()).toEqual({
      id: "site-c",
      slug: "site-c",
      name: "Site C",
      status: "active",
    });
  });

  it("does not serve one site's tenant on another site's host", async () => {
    serveFrom("site-a.example");
    expect(await tenantInfo()).toMatchObject({
      id: "default",
      slug: "default",
    });
  });

  it("passes the resolved tenant id to the query layer", async () => {
    serveFrom("starter-solid-stack.vercel.app");
    await overviewData();
    await logsData(3);
    await goData();

    expect(getOverview).toHaveBeenCalledWith("site-c");
    expect(getLogs).toHaveBeenCalledWith("site-c", 3);
    expect(getGo).toHaveBeenCalledWith("site-c");
    expect(await logsData(3)).toEqual({ marker: "logs" });
  });

  it("rejects a request whose host resolves to no tenant", async () => {
    serveFrom("unknown.example");
    await expect(tenantInfo()).rejects.toThrow("Unknown tenant");
    await expect(overviewData()).rejects.toThrow("Unknown tenant");
    expect(getOverview).not.toHaveBeenCalled();
  });

  it("rejects when there is no request event at all", async () => {
    currentRequest = null;
    await expect(tenantInfo()).rejects.toThrow("Unknown tenant");
    expect(resolveTenantFromHost).toHaveBeenCalledWith(null);
  });
});
