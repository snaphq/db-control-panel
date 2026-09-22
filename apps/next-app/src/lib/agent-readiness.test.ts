import { describe, expect, it, vi } from "vitest";

// The production modules intentionally use `server-only`. Bun's unit-test
// runner does not provide a Next.js server/client boundary, so replace the
// marker before loading the modules under test.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/site-config", () => ({
  absoluteUrl: (pathname: string) =>
    new URL(pathname, "https://test.invalid").toString(),
  getSiteUrl: () => "https://test.invalid",
}));

const {
  assertSafeAiProviderEndpoint,
  assertSafeMcpEndpoint,
  isPrivateAddress,
  safeMcpHeaders,
} = await import("./integrations/mcp-proxy");
const { decryptJson, encryptJson } = await import("./integrations/encryption");
const { normalizeMcpHeaders, publicMcpHeaders, toSafeInstallation } =
  await import("./integrations/types");
const { getProviderHandler } = await import("./integrations/provider-handlers");
const { verificationUriFor } = await import("./agent-auth/claim-uri");
const { selectPrimaryOrganizationMembership } = await import(
  "./agent-auth/claims"
);
const { eventNotificationUrlForRequest, requestOriginForRequest } =
  await import("./agent-auth/discovery");
const { isClaimAttemptUsable, MAX_CODE_ATTEMPTS } = await import(
  "./agent-auth/claim-policy"
);
const { isRegistrationUsable } = await import(
  "./agent-auth/registration-policy"
);
const { isLocalTenantHost, normalizeTenantDomain, normalizeTenantHost } =
  await import("@repo/database");
const { sanitizeHeaders } = await import("@repo/mcp-chatgpt");
const { resolveAuthClientBaseUrl } = await import("@repo/auth/client");
const { getDefaultModel } = await import("@repo/ai");

describe("MCP egress policy", () => {
  it("routes the shared AI client through provider URL validation", () => {
    const previousKey = process.env.OPENAI_API_KEY;
    const previousBase = process.env.OPENAI_BASE_URL;
    const previousModel = process.env.AI_DEFAULT_MODEL;
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_BASE_URL", "https://api.openai.com/v1?api_key=secret");
    vi.stubEnv("AI_DEFAULT_MODEL", "gpt-test");
    try {
      expect(() => getDefaultModel()).toThrow(/queries/i);
    } finally {
      if (previousKey === undefined) vi.stubEnv("OPENAI_API_KEY", "");
      else vi.stubEnv("OPENAI_API_KEY", previousKey);
      if (previousBase === undefined) vi.stubEnv("OPENAI_BASE_URL", "");
      else vi.stubEnv("OPENAI_BASE_URL", previousBase);
      if (previousModel === undefined) vi.stubEnv("AI_DEFAULT_MODEL", "");
      else vi.stubEnv("AI_DEFAULT_MODEL", previousModel);
    }
  });

  it("rejects loopback and private literal addresses", async () => {
    await expect(
      assertSafeMcpEndpoint("https://127.0.0.1/mcp"),
    ).rejects.toThrow(/private|local/i);
    await expect(assertSafeMcpEndpoint("https://[::1]/mcp")).rejects.toThrow(
      /private|local/i,
    );
    await expect(
      assertSafeMcpEndpoint("https://[::ffff:c000:0201]/mcp"),
    ).rejects.toThrow(/private|local/i);
    await expect(
      assertSafeMcpEndpoint("https://[0:0:0:0:0:ffff:c000:0201]/mcp"),
    ).rejects.toThrow(/private|local/i);
  });

  it("classifies expanded IPv6 reserved ranges numerically", () => {
    expect(isPrivateAddress("0:0:0:0:0:0:0:1")).toBe(true);
    expect(isPrivateAddress("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe(
      true,
    );
    expect(isPrivateAddress("fe80:0000:0000:0000:0000:0000:0000:0001")).toBe(
      true,
    );
    expect(isPrivateAddress("fd12:3456:789a:0000:0000:0000:0000:0001")).toBe(
      true,
    );
    expect(isPrivateAddress("2001:4860:4860:0:0:0:0:8888")).toBe(false);
  });

  it("rejects credentials, fragments, and unsupported protocols", async () => {
    await expect(
      assertSafeMcpEndpoint("https://user:pass@8.8.8.8/mcp"),
    ).rejects.toThrow(/credentials/i);
    await expect(
      assertSafeMcpEndpoint("https://8.8.8.8/mcp#fragment"),
    ).rejects.toThrow(/fragment/i);
    await expect(assertSafeMcpEndpoint("file:///tmp/mcp")).rejects.toThrow(
      /http or https/i,
    );
    await expect(
      assertSafeMcpEndpoint("https://8.8.8.8/mcp?api_key=secret"),
    ).rejects.toThrow(/query/i);
  });

  it("requires HTTPS and an allowlist in production", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousVercelEnv = process.env.VERCEL_ENV;
    const previousAllowlist = process.env.MCP_PROXY_ALLOWED_HOSTS;
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("MCP_PROXY_ALLOWED_HOSTS", "");
    try {
      await expect(assertSafeMcpEndpoint("http://8.8.8.8/mcp")).rejects.toThrow(
        /HTTPS/i,
      );
      await expect(
        assertSafeMcpEndpoint("https://8.8.8.8/mcp"),
      ).rejects.toThrow(/allowlisted/i);
    } finally {
      if (previousNodeEnv === undefined) vi.unstubAllEnvs();
      else {
        vi.stubEnv("NODE_ENV", previousNodeEnv);
        if (previousVercelEnv === undefined) vi.stubEnv("VERCEL_ENV", "");
        else vi.stubEnv("VERCEL_ENV", previousVercelEnv);
        if (previousAllowlist === undefined)
          vi.stubEnv("MCP_PROXY_ALLOWED_HOSTS", "");
        else vi.stubEnv("MCP_PROXY_ALLOWED_HOSTS", previousAllowlist);
      }
    }
  });

  it("keeps AI-provider egress on approved hosts and rejects query credentials", async () => {
    await expect(
      assertSafeAiProviderEndpoint("https://api.openai.com/v1?api_key=secret"),
    ).rejects.toThrow(/query/i);

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("AI_PROVIDER_ALLOWED_HOSTS", "");
    try {
      await expect(
        assertSafeAiProviderEndpoint("https://8.8.8.8/v1"),
      ).rejects.toThrow(/allowlisted/i);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("filters ambient and forwarding headers before credential egress", () => {
    const result = safeMcpHeaders({
      Authorization: "Bearer secret",
      Cookie: "session=secret",
      Host: "internal.example",
      Origin: "https://app.example",
      Forwarded: "for=127.0.0.1",
      Via: "proxy.example",
      "X-Real-IP": "127.0.0.1",
      "Keep-Alive": "timeout=5",
      TE: "trailers",
      Trailer: "X-Checksum",
      Upgrade: "websocket",
      Connection: "X-Connection-Only",
      "X-Connection-Only": "secret",
      "X-Forwarded-For": "127.0.0.1",
      "X-Provider-Token": "provider-secret",
      "X-Provider-Trace": "trace-id",
      "X-Bad": "line1\nline2",
    });
    expect(result).toEqual({
      Authorization: "Bearer secret",
      "X-Provider-Token": "provider-secret",
      "X-Provider-Trace": "trace-id",
    });
  });

  it("deduplicates custom headers regardless of casing", () => {
    expect(
      safeMcpHeaders({
        authorization: "custom-secret",
        Authorization: "managed-secret",
        "X-Trace": "first",
        "x-trace": "last",
      }),
    ).toEqual({
      Authorization: "managed-secret",
      "x-trace": "last",
    });
  });

  it("redacts proxy and credential-bearing headers in logs", () => {
    expect(
      sanitizeHeaders({
        Authorization: "Bearer secret",
        "Proxy-Authorization": "Basic secret",
        "X-Refresh-Token": "refresh-secret",
        "X-Client-Secret": "client-secret",
        "X-Password": "password",
        "X-Trace": "trace-id",
      }),
    ).toEqual({
      Authorization: "[REDACTED]",
      "Proxy-Authorization": "[REDACTED]",
      "X-Refresh-Token": "[REDACTED]",
      "X-Client-Secret": "[REDACTED]",
      "X-Password": "[REDACTED]",
      "X-Trace": "trace-id",
    });
  });
});

describe("agent authentication boundaries", () => {
  it("keeps browser auth calls on the active tenant origin", () => {
    const previousAuthUrl = process.env.BETTER_AUTH_URL;
    const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    vi.stubEnv("BETTER_AUTH_URL", "https://platform.example");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example");
    try {
      expect(resolveAuthClientBaseUrl("https://tenant.example")).toBe(
        "https://tenant.example",
      );
      expect(resolveAuthClientBaseUrl(undefined)).toBe(
        "https://platform.example",
      );
    } finally {
      if (previousAuthUrl === undefined) vi.stubEnv("BETTER_AUTH_URL", "");
      else vi.stubEnv("BETTER_AUTH_URL", previousAuthUrl);
      if (previousAppUrl === undefined) vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
      else vi.stubEnv("NEXT_PUBLIC_APP_URL", previousAppUrl);
    }
  });

  it("binds claim verification URLs to the owning origin", () => {
    const url = new URL(
      verificationUriFor("cat_attempt", "https://tenant.example"),
    );
    expect(url.origin).toBe("https://tenant.example");
    expect(url.pathname).toBe("/auth/sign-in");
    expect(url.searchParams.get("redirect")).toBe(
      "/claim?claim_attempt_token=cat_attempt",
    );
  });
});

describe("custom MCP installation boundaries", () => {
  it("encrypts custom headers and redacts legacy public projections", () => {
    const previousKey = process.env.INTEGRATION_ENCRYPTION_KEY;
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "11".repeat(32));
    try {
      const handler = getProviderHandler("custom-mcp-server");
      expect(handler).not.toBeNull();

      const split = handler?.splitConfig({
        endpointUrl: "https://mcp.example.test/mcp",
        authType: "bearer",
        credentials: "bearer-secret",
        headers: {
          "X-Provider-Trace": "trace-id",
          Authorization: "header-secret",
        },
        toolAllowlist: ["tools/list"],
      });
      expect(split?.publicConfig).toEqual({
        endpointUrl: "https://mcp.example.test/mcp",
        authType: "bearer",
        toolAllowlist: ["tools/list"],
      });
      expect(() =>
        handler?.validate({
          endpointUrl: "https://mcp.example.test/mcp?api_key=secret",
          authType: "none",
        }),
      ).toThrow(/query/i);
      expect(split?.secret).toEqual({
        credentials: "bearer-secret",
        headers: {
          "X-Provider-Trace": "trace-id",
          Authorization: "header-secret",
        },
      });

      const ciphertext = encryptJson(split?.secret);
      expect(ciphertext).not.toContain("bearer-secret");
      expect(decryptJson(ciphertext)).toEqual(split?.secret);

      const safe = toSafeInstallation({
        id: "installation-1",
        integrationId: "custom-mcp",
        organizationId: "org-1",
        projectId: null,
        displayName: "Remote MCP",
        configEncrypted: ciphertext,
        configPublic: {
          endpointUrl: "https://mcp.example.test/mcp",
          authType: "bearer",
          headers: {
            Authorization: "legacy-secret",
            "X-Provider-Trace": "trace-id",
          },
        },
        status: "active",
        lastVerifiedAt: null,
        lastError: null,
        isSystemManaged: false,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      } as Parameters<typeof toSafeInstallation>[0]);
      expect(safe).not.toHaveProperty("configEncrypted");
      expect(safe.hasSecret).toBe(true);
      expect(safe.configPublic).toMatchObject({
        headers: {
          Authorization: "[redacted; rotate this header]",
          "X-Provider-Trace": "trace-id",
        },
      });
      const legacyQuery = toSafeInstallation({
        id: "installation-legacy-query",
        integrationId: "custom-mcp",
        organizationId: "org-1",
        projectId: null,
        displayName: "Legacy Remote MCP",
        configEncrypted: null,
        configPublic: {
          endpointUrl: "https://mcp.example.test/mcp?api_key=secret",
        },
        status: "error",
        lastVerifiedAt: null,
        lastError: null,
        isSystemManaged: false,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      } as Parameters<typeof toSafeInstallation>[0]);
      expect(legacyQuery.configPublic).toMatchObject({
        endpointUrl: "https://mcp.example.test/mcp",
      });
      expect(JSON.stringify(legacyQuery)).not.toContain("secret");
    } finally {
      if (previousKey === undefined) vi.unstubAllEnvs();
      else vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", previousKey);
    }
  });

  it("validates and bounds custom header values", () => {
    expect(
      normalizeMcpHeaders({ "X-Trace": "trace", "X-Api-Key": "secret" }),
    ).toEqual({ "X-Trace": "trace", "X-Api-Key": "secret" });
    expect(
      publicMcpHeaders({ Authorization: "secret", "X-Trace": "trace" }),
    ).toEqual({ "X-Trace": "trace" });
    expect(() => normalizeMcpHeaders({ "bad header": "value" })).toThrow(
      /Invalid MCP header name/,
    );
    expect(() => normalizeMcpHeaders({ "X-Trace": 42 })).toThrow(
      /must be a string/,
    );
    expect(() => normalizeMcpHeaders({ "X-Trace": "line1\r\nline2" })).toThrow(
      /CR or LF/,
    );
  });
});

describe("tenant and registration boundaries", () => {
  it("does not select a primary organization across malformed tenant joins", () => {
    expect(
      selectPrimaryOrganizationMembership(
        [
          {
            organizationId: "org-crossed",
            memberTenantId: "tenant-a",
            organizationTenantId: "tenant-b",
          },
        ],
        "tenant-a",
      ),
    ).toBeNull();
    expect(
      selectPrimaryOrganizationMembership(
        [
          {
            organizationId: "org-a",
            memberTenantId: "tenant-a",
            organizationTenantId: "tenant-a",
          },
        ],
        "tenant-a",
      ),
    ).toBe("org-a");
  });

  it("normalizes tenant authorities without selecting a default for unknown hosts", () => {
    expect(normalizeTenantDomain("https://TENANT.example.test:443/path")).toBe(
      "tenant.example.test",
    );
    expect(normalizeTenantDomain("tenant.example.test:8443")).toBe(
      "tenant.example.test",
    );
    expect(normalizeTenantDomain("foo@tenant.example.test")).toBeNull();
    expect(normalizeTenantDomain("https://foo@tenant.example.test/path")).toBe(
      null,
    );
    expect(normalizeTenantHost("https://tenant.example.test/path")).toBeNull();
    expect(normalizeTenantHost("tenant.example.test/path")).toBeNull();
    expect(normalizeTenantHost("tenant.example.test:8443")).toBe(
      "tenant.example.test",
    );
    expect(normalizeTenantDomain(null)).toBeNull();
    expect(isLocalTenantHost("workspace.localhost:3000")).toBe(true);
    expect(isLocalTenantHost("attackerlocalhost")).toBe(false);
    expect(
      requestOriginForRequest(
        new Request("https://internal.invalid/mcp", {
          headers: { host: "TENANT.example.test:443" },
        }),
      ),
    ).toBe("https://tenant.example.test");
    expect(
      requestOriginForRequest(
        new Request("http://internal.invalid/mcp", {
          headers: { host: "tenant.example.test:80" },
        }),
      ),
    ).toBe("http://tenant.example.test");
    expect(
      requestOriginForRequest(
        new Request("https://internal.invalid/mcp", {
          headers: { host: "TENANT.example.test.:8443" },
        }),
      ),
    ).toBe("https://tenant.example.test:8443");
    expect(
      eventNotificationUrlForRequest(
        new Request("https://internal.invalid/agent/event/notify", {
          headers: { host: "tenant.example.test" },
        }),
      ),
    ).toBe("https://tenant.example.test/agent/event/notify");
  });

  it("rejects expired, revoked, and ownerless registrations", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const active = {
      status: "claimed",
      registrationExpiresAt: new Date("2026-01-02T00:00:00.000Z"),
      claimExpiresAt: null,
      userId: "user-1",
    } as const;
    expect(isRegistrationUsable(active, now)).toBe(true);
    expect(
      isRegistrationUsable({ ...active, registrationExpiresAt: now }, now),
    ).toBe(false);
    expect(isRegistrationUsable({ ...active, userId: null }, now)).toBe(false);
    expect(isRegistrationUsable({ ...active, status: "revoked" }, now)).toBe(
      false,
    );
    expect(
      isRegistrationUsable(
        {
          ...active,
          status: "unclaimed",
          claimExpiresAt: now,
        },
        now,
      ),
    ).toBe(false);
  });

  it("enforces claim-attempt expiry and failed-code limits", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const active = {
      status: "initiated",
      expiresAt: new Date("2026-01-01T00:01:00.000Z"),
      failedAttempts: 0,
    } as const;
    expect(isClaimAttemptUsable(active, now)).toBe(true);
    expect(
      isClaimAttemptUsable(
        { ...active, failedAttempts: MAX_CODE_ATTEMPTS },
        now,
      ),
    ).toBe(false);
    expect(isClaimAttemptUsable({ ...active, expiresAt: now }, now)).toBe(
      false,
    );
    expect(isClaimAttemptUsable({ ...active, status: "completed" }, now)).toBe(
      false,
    );
  });
});
