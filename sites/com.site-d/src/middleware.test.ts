import { describe, expect, it, vi } from "vitest";

/**
 * Cross-site isolation for the request guard.
 *
 * Every site in this monorepo shares one database, so this guard is the only
 * thing between an unrecognized Host header and some tenant's pages. An
 * unresolvable tenant must 404; it must never fall back to a default
 * identity.
 *
 * @repo/database is mocked with a host -> tenant map, following the pattern in
 * packages/core/src/tenant-isolation.test.ts and
 * sites/com.site-c/src/http/tenant-guard.test.ts, so these run without a
 * database.
 */

const tenantsByHost: Record<
  string,
  { id: string; slug: string; name: string; status: string }
> = {
  "starter-astro-stack.vercel.app": {
    id: "site-d",
    slug: "site-d",
    name: "Site D",
    status: "active",
  },
  "starter-solid-stack.vercel.app": {
    id: "site-c",
    slug: "site-c",
    name: "Site C",
    status: "active",
  },
};

vi.mock("@repo/database", () => ({
  resolveTenantFromHost: vi.fn(async (host: string | null) =>
    host ? (tenantsByHost[host] ?? null) : null,
  ),
}));

const { onRequest: defineGuard } = await import("./middleware");

// The guard only reads request.headers and writes locals.tenant, so the tests
// drive it with that slice of Astro's APIContext instead of building the full
// object.
type Guard = (
  context: { request: Request; locals: FakeLocals },
  next: () => Promise<Response>,
) => Promise<Response>;

const guard = defineGuard as unknown as Guard;

interface FakeLocals {
  tenant?: { id: string };
}

function context(url: string, host: string | null) {
  const request = new Request(url, { headers: host ? { host } : {} });
  return {
    request,
    locals: {} as FakeLocals,
  };
}

const next = () => Promise.resolve(new Response("next"));

describe("tenant guard", () => {
  it("404s a request whose host maps to no tenant", async () => {
    const res = await guard(
      context("https://unknown.example/", "unknown.example"),
      next,
    );
    expect(res.status).toBe(404);
  });

  it("404s a request with no host header rather than assuming a tenant", async () => {
    const res = await guard(context("https://unknown.example/", null), next);
    expect(res.status).toBe(404);
  });

  it("does not let a query string smuggle a different host past the guard", async () => {
    const res = await guard(
      context(
        "https://unknown.example/?host=starter-astro-stack.vercel.app",
        "unknown.example",
      ),
      next,
    );
    expect(res.status).toBe(404);
  });

  it("serves the page and binds the resolved tenant to locals", async () => {
    const ctx = context(
      "https://starter-astro-stack.vercel.app/",
      "starter-astro-stack.vercel.app",
    );
    const res = await guard(ctx, next);
    expect(res.status).toBe(200);
    expect(ctx.locals.tenant?.id).toBe("site-d");
  });

  it("binds another site's host to that site's tenant, never this one", async () => {
    const ctx = context(
      "https://starter-solid-stack.vercel.app/",
      "starter-solid-stack.vercel.app",
    );
    await guard(ctx, next);
    expect(ctx.locals.tenant?.id).toBe("site-c");
  });
});
