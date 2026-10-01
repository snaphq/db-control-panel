import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cross-site isolation for operator tokens: every site shares one database,
 * so a credential issued on one site's tenant must never authenticate on
 * another site's host.
 */

vi.mock("server-only", () => ({}));

// Each awaited query consumes the next queued result, in call order.
const queryResults: unknown[][] = [];

function queryChain(): unknown {
  const chain: Record<string | symbol, unknown> = {};
  return new Proxy(chain, {
    get(_target, property) {
      if (property === "then") {
        const result = queryResults.shift() ?? [];
        return (resolve: (value: unknown) => void) => resolve(result);
      }
      if (property === "catch") return () => undefined;
      return () => queryChain();
    },
  });
}

const tenantsByHost: Record<string, { id: string }> = {
  "alloydb.console.example": { id: "tenant-a" },
  "site-b.example": { id: "tenant-b" },
};

vi.mock("@repo/database", async () => {
  const drizzle = await import("drizzle-orm");
  return {
    and: drizzle.and,
    eq: drizzle.eq,
    isNull: drizzle.isNull,
    db: () => queryChain(),
    resolveTenantFromHost: vi.fn(
      async (host: string | null) => (host && tenantsByHost[host]) ?? null,
    ),
  };
});

const { generateOperatorTokenPlaintext, verifyOperatorToken } = await import(
  "./auth/operator-token"
);

const token = generateOperatorTokenPlaintext();

function tokenRow(tenantId: string) {
  return {
    tokenId: "tok_1",
    tokenTenantId: tenantId,
    tokenExpiresAt: null,
    operatorId: "op_1",
    operatorName: "CI bot",
    operatorStatus: "active",
    operatorRevokedAt: null,
    operatorTenantId: tenantId,
    operatorScope: { mode: "all_owned" },
    userId: "user_1",
  };
}

function requestFor(host: string): Request {
  return new Request(`https://${host}/mcp`, {
    method: "POST",
    headers: { host, authorization: `Bearer ${token}` },
  });
}

describe("operator tokens across sites", () => {
  beforeEach(() => {
    queryResults.length = 0;
  });

  it("authenticates on the site whose tenant issued the token", async () => {
    queryResults.push(
      [tokenRow("tenant-a")],
      [{ tenantId: "tenant-a", archivedAt: null }],
      [{ id: "org_1", slug: "acme", name: "Acme", role: "owner" }],
    );

    const verified = await verifyOperatorToken(
      requestFor("alloydb.console.example"),
    );

    expect(verified).toMatchObject({
      tenantId: "tenant-a",
      organizations: [{ id: "org_1" }],
    });
  });

  it("rejects the same token on another site's host", async () => {
    // Everything else would succeed on site B; only the token's tenant differs.
    queryResults.push(
      [tokenRow("tenant-a")],
      [{ tenantId: "tenant-b", archivedAt: null }],
      [{ id: "org_2", slug: "globex", name: "Globex", role: "owner" }],
    );

    expect(await verifyOperatorToken(requestFor("site-b.example"))).toBeNull();
  });

  it("rejects a token whose owner belongs to another site's tenant", async () => {
    queryResults.push(
      [tokenRow("tenant-a")],
      [{ tenantId: "tenant-b", archivedAt: null }],
      [{ id: "org_1", slug: "acme", name: "Acme", role: "owner" }],
    );

    expect(
      await verifyOperatorToken(requestFor("alloydb.console.example")),
    ).toBeNull();
  });

  it("rejects requests from hosts that map to no site", async () => {
    queryResults.push([tokenRow("tenant-a")]);

    expect(await verifyOperatorToken(requestFor("unknown.example"))).toBeNull();
  });
});
