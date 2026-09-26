import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "../proxy";

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`https://admin.example${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("backend proxy", () => {
  it("redirects signed-out page requests to /login", () => {
    const response = proxy(request("/dashboard"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://admin.example/login",
    );
  });

  it("answers signed-out admin API requests with 401 instead of a redirect", async () => {
    const response = proxy(request("/api/admin/tenants"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("lets machine endpoints authenticate themselves", () => {
    for (const path of [
      "/login",
      "/api/webhooks/stripe",
      "/api/payments/webhook",
      "/api/inngest",
      "/mcp",
    ]) {
      expect(proxy(request(path)).headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("passes requests that carry a session cookie on to the page gate", () => {
    const response = proxy(
      request("/dashboard", "backend_admin_session=opaque"),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
