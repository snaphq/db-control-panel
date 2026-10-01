import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Authorization of the Databases routes: the organization and project sent to
 * the control plane come from one tenant-scoped membership query, so a user
 * outside the project's organization learns nothing about it.
 */

vi.mock("server-only", () => ({}));

const session = { current: null as { user: { id: string } } | null };
const tenant = { current: { id: "tenant-a" } as { id: string } | null };
const rows: unknown[][] = [];
const conditions: unknown[] = [];

function queryChain(): unknown {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "then") {
          const result = rows.shift() ?? [];
          return (resolve: (value: unknown) => void) => resolve(result);
        }
        if (property === "where") {
          return (condition: unknown) => {
            conditions.push(condition);
            return queryChain();
          };
        }
        return () => queryChain();
      },
    },
  );
}

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "console.example" }),
}));
vi.mock("@repo/auth/server", () => ({
  auth: { api: { getSession: async () => session.current } },
}));
vi.mock("@repo/database", async () => {
  const drizzle = await import("drizzle-orm");
  return {
    and: drizzle.and,
    eq: drizzle.eq,
    db: () => queryChain(),
    resolveTenantFromHost: async () => tenant.current,
  };
});

const { requireProjectAccess } = await import("./access");

const membership = (role: string) => ({
  organizationId: "org-1",
  projectId: "proj-1",
  role,
});

describe("requireProjectAccess", () => {
  beforeEach(() => {
    session.current = { user: { id: "user-1" } };
    tenant.current = { id: "tenant-a" };
    rows.length = 0;
    conditions.length = 0;
  });

  it("answers 401 without a session and never queries", async () => {
    session.current = null;
    const result = await requireProjectAccess("proj-1", { write: false });
    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(conditions).toHaveLength(0);
  });

  it("answers 404 when the host has no tenant", async () => {
    tenant.current = null;
    const result = await requireProjectAccess("proj-1", { write: false });
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it("answers 404 for a member of another organization", async () => {
    rows.push([]); // no project row joins the caller's membership
    const result = await requireProjectAccess("proj-1", { write: false });
    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(result).not.toHaveProperty("access");
  });

  it("scopes the single membership query by user, tenant and project", async () => {
    rows.push([membership("owner")]);
    await requireProjectAccess("proj-1", { write: false });
    const dialect = new PgDialect();
    const where = dialect.sqlToQuery(conditions[0] as never);
    expect(where.params).toEqual(
      expect.arrayContaining(["proj-1", "tenant-a"]),
    );
    expect(conditions).toHaveLength(1);
  });

  it("lets any member read and derives the scope from the database row", async () => {
    rows.push([membership("member")]);
    const result = await requireProjectAccess("proj-1", { write: false });
    expect(result).toEqual({
      ok: true,
      access: {
        userId: "user-1",
        tenantId: "tenant-a",
        role: "member",
        scope: { organizationId: "org-1", projectId: "proj-1" },
      },
    });
  });

  it("refuses changes from a plain member with 403", async () => {
    rows.push([membership("member")]);
    const result = await requireProjectAccess("proj-1", { write: true });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it.each(["owner", "admin"])("allows %s to change databases", async (role) => {
    rows.push([membership(role)]);
    const result = await requireProjectAccess("proj-1", { write: true });
    expect(result).toMatchObject({ ok: true });
  });
});
