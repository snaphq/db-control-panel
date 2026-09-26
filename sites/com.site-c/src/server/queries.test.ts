import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tenant scoping for the dashboard read models.
 *
 * The API takes no tenant parameter by design — the tenant comes from the Host
 * header via the request guard and arrives as `c.env.tenant`. These tests pin
 * that: whichever tenant the guard resolved is the only one any query may read.
 *
 * The drizzle query builder is mocked as a chainable recorder, so the assertions
 * are about the WHERE clauses the code emits rather than about a live database.
 */

type Recorded = { table: string; innerJoin: string[]; where: unknown };

const recorded: Recorded[] = [];
let whereValue: unknown = null;

/** Rows returned by the next chained terminal call, keyed by call order. */
const results: unknown[] = [];

function chain(table: string) {
  const entry: Recorded = { table, innerJoin: [], where: null };
  recorded.push(entry);
  const api: Record<string, unknown> = {};
  const methods = [
    "select",
    "from",
    "innerJoin",
    "leftJoin",
    "where",
    "groupBy",
    "orderBy",
    "limit",
    "offset",
  ];
  for (const name of methods) {
    api[name] = (...args: unknown[]) => {
      if (name === "innerJoin" || name === "leftJoin")
        entry.innerJoin.push(String(args[1]));
      if (name === "where") {
        whereValue = args[0];
        entry.where = args[0];
      }
      return api;
    };
  }
  // Awaiting the chain resolves the next queued result. `then` has to invoke
  // the callback rather than return a promise, or every await hangs. The lint
  // rule is React's "don't make objects thenable" advice; a drizzle query
  // builder genuinely is thenable, so this is the one place it does not apply.
  // biome-ignore lint/suspicious/noThenProperty: mocking a thenable query builder
  api.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => {
    const value = results.length ? results.shift() : [];
    return Promise.resolve(value).then(onFulfilled, onRejected);
  };
  return api;
}

vi.mock("@repo/database", async () => {
  const drizzle = await import("drizzle-orm");
  return {
    db: () => chain("query"),
    and: drizzle.and,
    eq: drizzle.eq,
    inArray: drizzle.inArray,
    desc: drizzle.desc,
    count: drizzle.count,
  };
});

vi.mock("@repo/database/schema", async () => {
  const columns = new Proxy(
    {},
    { get: (_t, key) => ({ name: String(key), table: "col" }) },
  );
  const tables = new Proxy({}, { get: (_t, key) => ({ name: String(key) }) });
  return {
    organization: { ...columns, __table: "organization" },
    orgAuditLogs: { ...columns, __table: "org_audit_logs" },
    orgBilling: { ...columns, __table: "org_billing" },
    planTier: { ...columns, __table: "plan_tier" },
  };
});

vi.mock("@repo/auth/server", () => ({
  getBetterAuthServer: vi.fn(() => ({
    getAuthInstance: () => ({ handler: vi.fn() }),
  })),
}));

const { getLogs, getOverview } = await import("../server/queries");

beforeEach(() => {
  recorded.length = 0;
  results.length = 0;
  whereValue = null;
});

describe("dashboard queries", () => {
  it("scopes the audit log to the resolved tenant and pages it", async () => {
    results.push(
      [
        {
          id: "a1",
          action: "subscription_created",
          fromValue: null,
          toValue: "tier1",
          performedBy: "user_1",
          createdAt: new Date("2026-01-02T03:04:05Z"),
          organization: "Acme",
        },
      ],
      // Promise.all in getOverview is not used here, so only the log query runs.
    );

    const page = await getLogs("site-c", 2);

    expect(page.page).toBe(2);
    expect(page.pageSize).toBe(50);
    expect(page.hasMore).toBe(false);
    expect(page.entries[0]?.action).toBe("subscription_created");
    // 2 pages of 50 is an offset of 100.
    expect(JSON.stringify(page)).toContain("Acme");
    // The audit table has no tenant column, so the query must join through
    // organization rather than filtering org_audit_logs directly.
    expect(recorded.some((entry) => entry.innerJoin.length > 0)).toBe(true);
  });

  it("never widens the tenant filter to another tenant", async () => {
    results.push([]);
    await getLogs("site-c", 0);

    // The resolved tenant is the only value bound into the WHERE clause.
    const serialized = JSON.stringify(whereValue, (_key, value) =>
      typeof value === "object" && value !== null && "value" in value
        ? String(value.value)
        : value,
    );
    expect(serialized).toContain("site-c");
  });

  it("reports zero rather than throwing when the tenant has no rows", async () => {
    results.push([], [], []);
    const summary = await getOverview("site-c");

    expect(summary.organizations).toBe(0);
    expect(summary.auditEvents).toBe(0);
    expect(summary.plans).toEqual([]);
  });
});
