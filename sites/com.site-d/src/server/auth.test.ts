import { describe, expect, it, vi } from "vitest";

/**
 * The /api/auth mount must scope every auth operation to the Host-resolved
 * tenant and delegate the request to the shared Better Auth handler verbatim.
 * @repo/auth and @repo/core are stubbed so no database or `server-only`
 * machinery loads (same approach as
 * sites/com.site-c/src/http/tenant-guard.test.ts).
 */

const handler = vi.fn((_request: Request) =>
  Promise.resolve(new Response("auth")),
);

const tenantContext = vi.fn(async (_ctx: unknown, fn: () => unknown) => fn());

vi.mock("@repo/auth/server", () => ({
  getBetterAuthServer: vi.fn(() => ({
    getAuthInstance: () => ({ handler }),
  })),
  runWithAuthTenantContext: tenantContext,
}));

vi.mock("@repo/core/agent-auth/discovery", () => ({
  resourceUrlForRequest: vi.fn((request: Request) =>
    new URL("/mcp", new URL(request.url).origin).toString(),
  ),
}));

const { handleAuth } = await import("./auth");

const tenant = {
  id: "site-d",
  slug: "site-d",
  name: "Site D",
  status: "active",
};

describe("auth mount", () => {
  it("delegates the request to the Better Auth handler", async () => {
    const request = new Request("https://site-d.example/api/auth/sign-in", {
      method: "POST",
    });
    const res = await handleAuth(tenant as never, request);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(request);
  });

  it("runs the handler inside this tenant's auth context", async () => {
    const request = new Request("https://site-d.example/api/auth/session");
    await handleAuth(tenant as never, request);
    expect(tenantContext).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "site-d",
        resource: "https://site-d.example/mcp",
      }),
      expect.any(Function),
    );
  });
});
