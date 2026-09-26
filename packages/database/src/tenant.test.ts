import { afterEach, describe, expect, it, vi } from "vitest";
import { getLocalTenantId, isLocalTenantHost } from "./tenant";

describe("getLocalTenantId", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the tenant pinned by the running site", () => {
    vi.stubEnv("SITE_TENANT_ID", "site-b");
    vi.stubEnv("DEFAULT_TENANT_ID", "default");
    expect(getLocalTenantId()).toBe("site-b");
  });

  it("falls back to DEFAULT_TENANT_ID outside a site build", () => {
    vi.stubEnv("SITE_TENANT_ID", "");
    vi.stubEnv("DEFAULT_TENANT_ID", "acme");
    expect(getLocalTenantId()).toBe("acme");
  });

  it("falls back to the built-in default tenant", () => {
    vi.stubEnv("SITE_TENANT_ID", " ");
    vi.stubEnv("DEFAULT_TENANT_ID", "");
    expect(getLocalTenantId()).toBe("default");
  });
});

describe("isLocalTenantHost", () => {
  it("treats localhost aliases as local", () => {
    expect(isLocalTenantHost("localhost:8802")).toBe(true);
    expect(isLocalTenantHost("site-b.localhost:8802")).toBe(true);
    expect(isLocalTenantHost("127.0.0.1:8801")).toBe(true);
  });

  it("never treats a real domain as local", () => {
    expect(isLocalTenantHost("site-b.example.com")).toBe(false);
    expect(isLocalTenantHost("localhost.example.com")).toBe(false);
  });
});
