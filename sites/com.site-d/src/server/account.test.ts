import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tenant scoping for the account read models.
 *
 * No function accepts a tenant from the client: the tenant comes from the
 * Host header via the request guard, and the user id comes from the session.
 * These tests pin that whichever tenant the guard resolved is the only one
 * any query may read, and that the user id is always bound alongside it.
 *
 * The drizzle query builder is mocked as a chainable recorder, so the
 * assertions are about the WHERE clauses the code emits rather than about a
 * live database (same approach as sites/com.site-c/src/server/queries.test.ts).
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
  // Awaiting the chain resolves the next queued result. A drizzle query
  // builder genuinely is thenable, so this is the one place the "don't make
  // objects thenable" lint advice does not apply.
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
    desc: drizzle.desc,
  };
});

vi.mock("@repo/database/schema", async () => {
  const columns = new Proxy(
    {},
    { get: (_t, key) => ({ name: String(key), table: "col" }) },
  );
  const tables = new Proxy({}, { get: (_t, key) => ({ name: String(key) }) });
  return {
    user: { ...columns, __table: "user" },
    session: { ...columns, __table: "session" },
    member: { ...columns, __table: "member" },
    organization: { ...columns, __table: "organization" },
  };
});

const { getAccountOverview, getUserOrganizations, getUserSessions } =
  await import("./account");

function serializeWhere(): string {
  return JSON.stringify(whereValue, (_key, value) =>
    typeof value === "object" && value !== null && "value" in value
      ? String(value.value)
      : value,
  );
}

beforeEach(() => {
  recorded.length = 0;
  results.length = 0;
  whereValue = null;
});

describe("account queries", () => {
  it("scopes organizations to the resolved tenant and the session user", async () => {
    results.push([
      {
        id: "org_1",
        name: "Acme",
        slug: "acme",
        status: "active",
        role: "admin",
      },
    ]);
    const orgs = await getUserOrganizations("site-d", "user_1");

    expect(orgs[0]?.name).toBe("Acme");
    // Membership crosses into organizations through the join; the tenant
    // filter rides on organization, the only tenant link that matters here.
    expect(recorded[0]?.innerJoin.length).toBe(1);
    const serialized = serializeWhere();
    expect(serialized).toContain("site-d");
    expect(serialized).toContain("user_1");
  });

  it("scopes sessions to the resolved tenant and the session user", async () => {
    results.push([]);
    await getUserSessions("site-d", "user_1");

    const serialized = serializeWhere();
    expect(serialized).toContain("site-d");
    expect(serialized).toContain("user_1");
  });

  it("never widens the tenant filter to another tenant", async () => {
    results.push([], [], []);
    await getAccountOverview("site-d", "user_1");

    const serialized = serializeWhere();
    expect(serialized).toContain("site-d");
    expect(serialized).not.toContain("site-c");
    expect(serialized).not.toContain("default");
  });

  it("returns empty collections rather than throwing on a fresh account", async () => {
    results.push([], [], []);
    const overview = await getAccountOverview("site-d", "user_1");

    expect(overview.account).toBeNull();
    expect(overview.organizations).toEqual([]);
    expect(overview.sessions).toEqual([]);
  });
});
