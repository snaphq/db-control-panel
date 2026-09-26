import { describe, expect, it, vi } from "vitest";

/**
 * Cross-site isolation for the request guard.
 *
 * Every site in this monorepo shares one database, so this guard is the only
 * thing between an unrecognized Host header and some tenant's data. An
 * unresolvable tenant must 404; it must never fall back to a default identity.
 *
 * @repo/database is mocked with a host -> tenant map, following the pattern in
 * packages/core/src/tenant-isolation.test.ts, so these run without a database.
 */

const tenantsByHost: Record<
  string,
  { id: string; slug: string; name: string; status: string }
> = {
  "site-c.vercel.app": {
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

// The real @solidjs/start/middleware imports the React-only `server-only`
// marker and runs inside the framework's h3 pipeline, neither of which exists
// here. createMiddleware returns an array argument unchanged, so a pass-through
// keeps the export shape and lets the test drive the guard directly.
vi.mock("@solidjs/start/middleware", () => ({
  createMiddleware: (middleware: unknown) => middleware,
}));

vi.mock("@repo/database", () => ({
  resolveTenantFromHost: vi.fn(async (host: string | null) =>
    host ? (tenantsByHost[host] ?? null) : null,
  ),
}));

// app.ts mounts Better Auth under /api/auth/*, and @repo/auth/server imports
// the `server-only` marker, which throws outside a real server. No auth route is
// exercised here, so stub it rather than loading the auth stack.
// app.ts also imports the MCP discovery helper for the auth resource URL; it
// is not exercised here and pulls more of @repo/core than this suite needs.
vi.mock("@repo/core/agent-auth/discovery", () => ({
  resourceUrlForRequest: vi.fn((request: Request) =>
    new URL("/mcp", new URL(request.url).origin).toString(),
  ),
}));

vi.mock("@repo/auth/server", () => ({
  getBetterAuthServer: vi.fn(() => ({
    getAuthInstance: () => ({ handler: vi.fn() }),
  })),
}));

const { default: middleware } = await import("./tenant-guard");

// createMiddleware returns an array argument unchanged, so the exported value is
// the middleware list itself and entry 0 is this site's request guard.
const guard = middleware[0] as (
  event: unknown,
) => Promise<Response | undefined>;

function event(url: string, host: string | null) {
  return {
    url: new URL(url),
    req: new Request(url, { headers: host ? { host } : {} }),
  };
}

describe("tenant guard", () => {
  it("404s a request whose host maps to no tenant", async () => {
    const res = await guard(
      event("https://unknown.example/api/health", "unknown.example"),
    );
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(404);
  });

  it("404s a request with no host header rather than assuming a tenant", async () => {
    const res = await guard(event("https://unknown.example/api/health", null));
    expect((res as Response).status).toBe(404);
  });

  it("404s a page request for an unknown host, not just /api", async () => {
    const res = await guard(
      event("https://unknown.example/", "unknown.example"),
    );
    expect((res as Response).status).toBe(404);
  });

  it("serves /api to a host whose tenant resolves", async () => {
    // Tenant binding itself is asserted in src/server/dashboard.test.ts: the
    // dashboard read models moved to server functions, and /api no longer
    // echoes the tenant back.
    const res = await guard(
      event("https://site-c.vercel.app/api/health", "site-c.vercel.app"),
    );
    expect((res as Response).status).toBe(200);
  });

  it("falls through to the file-system routes outside /api", async () => {
    expect(
      await guard(event("https://site-c.vercel.app/", "site-c.vercel.app")),
    ).toBeUndefined();
  });

  it("does not let a query string smuggle a different host past the guard", async () => {
    const res = await guard(
      event(
        "https://unknown.example/api/health?host=site-c.vercel.app",
        "unknown.example",
      ),
    );
    expect((res as Response).status).toBe(404);
  });
});
