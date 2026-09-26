import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DBTransactionAdapter } from "better-auth";
import { describe, expect, it, vi } from "vitest";

// The production modules intentionally use `server-only`. Bun's unit-test
// runner does not provide a Next.js server/client boundary, so replace the
// marker before loading the modules under test.
vi.mock("server-only", () => ({}));
vi.mock("@repo/core/site-config", () => ({
  absoluteUrl: (pathname: string) =>
    new URL(pathname, "https://test.invalid").toString(),
  getSiteUrl: () => "https://test.invalid",
}));

const { MCP_SERVER_INFO } = await import("@repo/core/mcp-server-info");
const { getProviderKeyResolver } = await import(
  "@repo/core/agent-auth/providers"
);
const {
  boundResourceFromMetadata,
  isSafeRedirectUri,
  matchesS256CodeChallenge,
  parseBasicAuthorization,
  validateDynamicRegistration,
} = await import("@repo/core/agent-auth/oauth-policy");
const { MCP_TOOL_METADATA } = await import("@repo/mcp-chatgpt");
const { registerAdminTools } = await import("@repo/mcp-server/admin");
const {
  currentAuthTenantContext,
  runWithAuthTenantContext,
  withTenantBoundAuthAdapter,
} = await import("@repo/auth/server");

function fakeAuthAdapter() {
  const create = vi.fn(
    async ({ data }: { data: Record<string, unknown> }) => data,
  );
  const findOne = vi.fn(async (input: unknown) => input);
  const findMany = vi.fn(async (input: unknown) => [input]);
  const count = vi.fn(async () => 1);
  const update = vi.fn(async ({ update: data }: { update: unknown }) => data);
  const updateMany = vi.fn(async () => 1);
  const remove = vi.fn(async () => undefined);
  const deleteMany = vi.fn(async () => 1);
  const transaction = vi.fn(
    async (callback: (adapter: DBTransactionAdapter) => unknown) =>
      callback({
        id: "fake-transaction",
        create,
        findOne,
        findMany,
        count,
        update,
        updateMany,
        delete: remove,
        deleteMany,
      } as unknown as DBTransactionAdapter),
  );
  return {
    id: "fake",
    create,
    findOne,
    findMany,
    count,
    update,
    updateMany,
    delete: remove,
    deleteMany,
    transaction,
  } as Parameters<typeof withTenantBoundAuthAdapter>[0];
}

describe("OAuth and MCP tool contracts", () => {
  it("rejects unsafe trusted-provider JWKS URLs before key resolution", () => {
    const provider = {
      issuer: "https://issuer.example",
      jwksUri: "http://127.0.0.1:8080/keys?token=secret",
    } as Parameters<typeof getProviderKeyResolver>[0];
    expect(() => getProviderKeyResolver(provider)).toThrow(/HTTPS/i);
    expect(() =>
      getProviderKeyResolver({
        issuer: "https://[::1]",
        jwksUri: "https://[fd00::1]/keys",
      } as Parameters<typeof getProviderKeyResolver>[0]),
    ).toThrow(/private/i);
  });

  it("parses case-insensitive Basic auth and verifies S256 PKCE", () => {
    const encoded = Buffer.from("client%2Bid:secret%2Bvalue").toString(
      "base64",
    );
    expect(parseBasicAuthorization(`bAsIc ${encoded}`)).toEqual({
      clientId: "client+id",
      clientSecret: "secret+value",
    });
    expect(parseBasicAuthorization("Bearer not-basic")).toBeNull();

    // A known RFC 7636 verifier/challenge pair.
    expect(
      matchesS256CodeChallenge(
        "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
        "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      ),
    ).toBe(true);
    expect(
      matchesS256CodeChallenge(
        "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk-invalid",
        "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      ),
    ).toBe(false);
  });

  it("keeps the MCP initialize identity aligned with discovery metadata", () => {
    expect(MCP_SERVER_INFO).toEqual({
      name: "nextjs-starter-kit-mcp",
      version: "0.1.0",
    });
  });

  it("accepts only safe redirect URIs and authorization-code clients", async () => {
    expect(isSafeRedirectUri("https://client.example/callback")).toBe(true);
    expect(isSafeRedirectUri("http://localhost:4100/callback")).toBe(true);
    expect(isSafeRedirectUri("http://client.example/callback")).toBe(false);
    expect(isSafeRedirectUri("https://user:pass@client.example/cb")).toBe(
      false,
    );

    const rejected = validateDynamicRegistration({
      client_name: "bad-client",
      grant_types: ["client_credentials"],
      response_types: ["token"],
      redirect_uris: ["https://client.example/callback"],
    });
    expect(rejected).toEqual({
      error: "invalid_client_metadata",
      description:
        "Only the authorization_code grant is supported for MCP clients",
    });
    expect(
      validateDynamicRegistration({
        client_name: "good-client",
        grant_types: ["authorization_code"],
        response_types: ["code"],
        redirect_uris: ["https://client.example/callback"],
        token_endpoint_auth_method: "client_secret_basic",
      }),
    ).toBeNull();
  });

  it("requires an exact resource binding for registration metadata", () => {
    expect(
      boundResourceFromMetadata({ resource: "https://tenant.example/mcp" }),
    ).toBe("https://tenant.example/mcp");
    expect(boundResourceFromMetadata({ resource: "" })).toBeNull();
    expect(boundResourceFromMetadata({ resource: 42 })).toBeNull();
    expect(boundResourceFromMetadata(null)).toBeNull();
  });

  it("keeps payment data out of tenant-bound admin MCP", () => {
    expect(MCP_TOOL_METADATA).not.toHaveProperty("get_payment_records");
    expect(MCP_TOOL_METADATA).not.toHaveProperty("get_payments_by_email");

    const registered: string[] = [];
    const server = {
      registerTool(name: string) {
        registered.push(name);
      },
    } as unknown as McpServer;
    registerAdminTools(server, async () => {});

    expect(registered).not.toContain("get_payment_records");
    expect(registered).not.toContain("get_payments_by_email");
    expect(registered).toContain("get_admin_stats");
  });
});

describe("Better Auth adapter tenant binding", () => {
  it("fails closed when tenant-bound operations lack request context", async () => {
    const adapter = withTenantBoundAuthAdapter(fakeAuthAdapter());

    await expect(
      adapter.findOne({
        model: "organization",
        where: [{ field: "id", value: "org-1" }],
      }),
    ).rejects.toThrow(/explicit tenant context/i);
  });

  it("binds OAuth writes and reads to both tenant and resource", async () => {
    const base = fakeAuthAdapter();
    const adapter = withTenantBoundAuthAdapter(base);

    await runWithAuthTenantContext(
      {
        tenantId: "tenant-a",
        resource: "https://tenant-a.example/mcp",
      },
      async () => {
        expect(currentAuthTenantContext()).toEqual({
          tenantId: "tenant-a",
          resource: "https://tenant-a.example/mcp",
        });
        await adapter.create({
          model: "oauthAccessToken",
          data: { accessToken: "access-token" },
        });
        await adapter.findOne({
          model: "oauthAccessToken",
          where: [{ field: "accessToken", value: "access-token" }],
        });
      },
    );

    expect(base.create).toHaveBeenCalledWith({
      model: "oauthAccessToken",
      data: {
        accessToken: "access-token",
        tenantId: "tenant-a",
        resource: "https://tenant-a.example/mcp",
      },
      select: undefined,
      forceAllowId: undefined,
    });
    expect(base.findOne).toHaveBeenCalledWith({
      model: "oauthAccessToken",
      where: [
        { field: "accessToken", value: "access-token" },
        {
          field: "tenantId",
          operator: "eq",
          value: "tenant-a",
          connector: "AND",
        },
        {
          field: "resource",
          operator: "eq",
          value: "https://tenant-a.example/mcp",
          connector: "AND",
        },
      ],
      select: undefined,
      join: undefined,
    });
  });

  it("rejects cross-tenant and cross-resource caller bindings", async () => {
    const adapter = withTenantBoundAuthAdapter(fakeAuthAdapter());

    await runWithAuthTenantContext(
      {
        tenantId: "tenant-a",
        resource: "https://tenant-a.example/mcp",
      },
      async () => {
        await expect(
          adapter.create({
            model: "organization",
            data: { name: "wrong", tenantId: "tenant-b" },
          }),
        ).rejects.toThrow(/tenantId/i);
        await expect(
          adapter.create({
            model: "oauthConsent",
            data: {
              clientId: "client-1",
              resource: "https://other.example/mcp",
            },
          }),
        ).rejects.toThrow(/resource/i);
        await expect(
          adapter.findMany({
            model: "organization",
            where: [{ field: "tenantId", value: "tenant-b" }],
          }),
        ).rejects.toThrow(/tenantId/i);
      },
    );
  });

  it("keeps tenant binding inside Better Auth transactions", async () => {
    const base = fakeAuthAdapter();
    const adapter = withTenantBoundAuthAdapter(base);

    await runWithAuthTenantContext(
      {
        tenantId: "tenant-a",
        resource: "https://tenant-a.example/mcp",
      },
      () =>
        adapter.transaction(async (transactionAdapter) => {
          await transactionAdapter.create({
            model: "organization",
            data: { name: "inside transaction" },
          });
        }),
    );

    expect(base.transaction).toHaveBeenCalledOnce();
    expect(base.create).toHaveBeenCalledWith({
      model: "organization",
      data: { name: "inside transaction", tenantId: "tenant-a" },
      select: undefined,
      forceAllowId: undefined,
    });
  });
});
