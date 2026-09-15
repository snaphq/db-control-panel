import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/redis", () => ({ getRedis: () => null }));

const { checkAgentIdentityRateLimit } = await import("./rate-limit");

describe("agent identity rate limiting", () => {
  it("enforces the anonymous fallback window when Redis is absent", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    const ip = `fallback-${crypto.randomUUID()}`;

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        checkAgentIdentityRateLimit(ip, "anonymous"),
      ),
    );

    expect(results).toEqual([true, true, true, true, true, false]);
    vi.unstubAllEnvs();
  });

  it("fails closed in production when Redis is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");

    await expect(
      checkAgentIdentityRateLimit("production-test", "anonymous"),
    ).resolves.toBe(false);
    await expect(
      checkAgentIdentityRateLimit(null, "identity_assertion"),
    ).resolves.toBe(false);

    vi.unstubAllEnvs();
  });
});
