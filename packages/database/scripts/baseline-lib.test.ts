import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  type BaselineMigration,
  type Queryable,
  type SchemaShape,
  type Snapshot,
  type TransactionalQueryable,
  applyBaseline,
  diffShape,
  hashMigration,
  managedSchemas,
  pickBaseline,
  planBaseline,
  shapeFromSnapshot,
} from "./baseline-lib";

const SNAPSHOT: Snapshot = {
  tables: {
    "public.user": {
      name: "user",
      schema: "",
      columns: {
        id: { name: "id", notNull: true },
        email: { name: "email", notNull: true },
        image: { name: "image", notNull: false },
      },
    },
    "public.session": {
      name: "session",
      schema: "",
      columns: { id: { name: "id", notNull: true } },
    },
  },
};

const SQL_TEXT = 'CREATE TABLE "user" ();\n--> statement-breakpoint\n';

const MIGRATION: BaselineMigration = {
  idx: 0,
  tag: "0000_baseline",
  when: 1791058615676,
  hash: hashMigration(SQL_TEXT),
};

interface FakeState {
  /** table -> [column, nullable]; keyed "schema.table" */
  tables: Record<string, [string, boolean][]>;
  /** undefined: the migrations table does not exist */
  history?: { hash: string; created_at: string | number }[];
}

/** Answers only the statements baseline-lib issues, and records every one. */
function fakeDb(state: FakeState) {
  const statements: { text: string; params?: unknown[] }[] = [];
  const query = async (text: string, params?: unknown[]) => {
    statements.push({ text, params });
    if (text.includes("information_schema.columns")) {
      return Object.entries(state.tables).flatMap(([key, columns]) => {
        const [schema, table] = key.split(".");
        return columns.map(([name, nullable]) => ({
          table_schema: schema,
          table_name: table,
          column_name: name,
          is_nullable: nullable ? "YES" : "NO",
        }));
      });
    }
    if (text.includes("to_regclass")) {
      return [
        { present: state.history ? "drizzle.__drizzle_migrations" : null },
      ];
    }
    if (text.startsWith("select hash, created_at")) return state.history ?? [];
    if (text.startsWith("CREATE TABLE IF NOT EXISTS")) state.history ??= [];
    if (text.startsWith("insert into")) {
      state.history = [
        ...(state.history ?? []),
        { hash: String(params?.[0]), created_at: Number(params?.[1]) },
      ];
    }
    return [];
  };
  const db: TransactionalQueryable = {
    query: query as Queryable["query"],
    transaction: async (run) => run({ query: query as Queryable["query"] }),
  };
  return { db, statements, state };
}

const matchingTables = (): FakeState["tables"] => ({
  "public.user": [
    ["id", false],
    ["email", false],
    ["image", true],
  ],
  "public.session": [["id", false]],
});

const withoutSession = (): FakeState["tables"] => {
  const { "public.session": _dropped, ...rest } = matchingTables();
  return rest;
};

const expectedShape = (): SchemaShape => shapeFromSnapshot(SNAPSHOT);

const writes = (statements: { text: string }[]) =>
  statements.filter(({ text }) =>
    /^(CREATE|insert|LOCK|DROP|ALTER|UPDATE|DELETE)/i.test(text.trim()),
  );

describe("hashMigration", () => {
  it("is the sha256 hex of the file, as drizzle-orm computes it", () => {
    expect(hashMigration(SQL_TEXT)).toBe(
      createHash("sha256").update(SQL_TEXT).digest("hex"),
    );
  });
});

describe("pickBaseline", () => {
  const journal = {
    entries: [
      { idx: 0, tag: "0000_baseline", when: 10 },
      { idx: 1, tag: "0001_next", when: 20 },
    ],
  };

  it("defaults to the first journal entry and hashes its file", () => {
    const read = vi.fn(() => SQL_TEXT);
    const picked = pickBaseline(journal, read);
    expect(picked).toMatchObject({ tag: "0000_baseline", when: 10 });
    expect(picked.hash).toBe(hashMigration(SQL_TEXT));
    expect(read).toHaveBeenCalledWith("0000_baseline");
  });

  it("selects an entry by tag and rejects unknown tags and empty journals", () => {
    expect(pickBaseline(journal, () => SQL_TEXT, "0001_next").when).toBe(20);
    expect(() => pickBaseline(journal, () => SQL_TEXT, "nope")).toThrow(/nope/);
    expect(() => pickBaseline({ entries: [] }, () => SQL_TEXT)).toThrow(
      /no entries/,
    );
  });
});

describe("shapeFromSnapshot and managedSchemas", () => {
  it("maps the empty snapshot schema to public and records nullability", () => {
    const shape = expectedShape();
    expect([...shape.keys()].sort()).toEqual(["public.session", "public.user"]);
    expect(shape.get("public.user")?.get("image")).toEqual({ notNull: false });
    expect(managedSchemas(shape)).toEqual(["public"]);
  });

  it("adds non-public schemas the snapshot uses", () => {
    const shape = shapeFromSnapshot({
      tables: {
        "archived.old": {
          name: "old",
          schema: "archived",
          columns: { id: { name: "id", notNull: true } },
        },
      },
    });
    expect(managedSchemas(shape)).toEqual(["archived", "public"]);
  });
});

describe("diffShape", () => {
  it("reports missing and extra tables and columns and nullability drift", () => {
    const live: SchemaShape = new Map([
      [
        "public.user",
        new Map([
          ["id", { notNull: false }],
          ["email", { notNull: true }],
          ["stray", { notNull: true }],
        ]),
      ],
      ["public.leftover", new Map([["id", { notNull: true }]])],
    ]);
    expect(diffShape(expectedShape(), live)).toEqual({
      missingTables: ["public.session"],
      extraTables: ["public.leftover"],
      missingColumns: ["public.user.image"],
      extraColumns: ["public.user.stray"],
      nullabilityMismatches: ["public.user.id (expected NOT NULL)"],
    });
  });
});

describe("planBaseline", () => {
  it("is ready for a push-created database without a migrations table", async () => {
    const { db, statements } = fakeDb({ tables: matchingTables() });
    const plan = await planBaseline(db, MIGRATION, expectedShape());
    expect(plan.state).toEqual({ kind: "ready" });
    expect(writes(statements)).toEqual([]);
  });

  it("is ready when an empty migrations table already exists", async () => {
    const { db } = fakeDb({ tables: matchingTables(), history: [] });
    const plan = await planBaseline(db, MIGRATION, expectedShape());
    expect(plan.state).toEqual({ kind: "ready" });
  });

  it("refuses when a baseline table is missing", async () => {
    const tables = withoutSession();
    const { db } = fakeDb({ tables });
    const plan = await planBaseline(db, MIGRATION, expectedShape());
    expect(plan.state).toMatchObject({
      kind: "refused",
      reasons: [expect.stringContaining("public.session")],
    });
  });

  it("refuses a missing column and a nullability mismatch", async () => {
    const tables = matchingTables();
    tables["public.user"] = [
      ["id", true],
      ["email", false],
    ];
    const { db } = fakeDb({ tables });
    const plan = await planBaseline(db, MIGRATION, expectedShape());
    expect(plan.state.kind).toBe("refused");
    const reasons =
      plan.state.kind === "refused" ? plan.state.reasons.join("\n") : "";
    expect(reasons).toContain("public.user.image");
    expect(reasons).toContain("public.user.id");
  });

  it("refuses unknown tables unless extras are allowed", async () => {
    const tables = {
      ...matchingTables(),
      "public.mystery": [["id", false]] as [string, boolean][],
    };
    const refused = await planBaseline(
      fakeDb({ tables }).db,
      MIGRATION,
      expectedShape(),
    );
    expect(refused.state).toMatchObject({
      kind: "refused",
      reasons: [expect.stringContaining("public.mystery")],
    });
    const allowed = await planBaseline(
      fakeDb({ tables }).db,
      MIGRATION,
      expectedShape(),
      { allowExtra: true },
    );
    expect(allowed.state).toEqual({ kind: "ready" });
  });

  it("recognises an already baselined database", async () => {
    const { db } = fakeDb({
      tables: matchingTables(),
      history: [{ hash: MIGRATION.hash, created_at: String(MIGRATION.when) }],
    });
    const plan = await planBaseline(db, MIGRATION, expectedShape());
    expect(plan.state).toEqual({ kind: "already-baselined" });
  });

  it("refuses a database that has any other migration history", async () => {
    const { db } = fakeDb({
      tables: matchingTables(),
      history: [{ hash: "something-else", created_at: "5" }],
    });
    const plan = await planBaseline(db, MIGRATION, expectedShape());
    expect(plan.state).toMatchObject({
      kind: "refused",
      reasons: [expect.stringContaining("use db:migrate")],
    });
  });

  it("refuses when the baseline is recorded but the schema drifted", async () => {
    const tables = withoutSession();
    const { db } = fakeDb({
      tables,
      history: [{ hash: MIGRATION.hash, created_at: MIGRATION.when }],
    });
    const plan = await planBaseline(db, MIGRATION, expectedShape());
    expect(plan.state).toMatchObject({
      kind: "refused",
      reasons: [
        expect.stringContaining("no longer matches"),
        expect.stringContaining("public.session"),
      ],
    });
  });
});

describe("applyBaseline", () => {
  it("creates the migrations table like drizzle and records hash and when", async () => {
    const fake = fakeDb({ tables: matchingTables() });
    const plan = await planBaseline(fake.db, MIGRATION, expectedShape());
    await applyBaseline(fake.db, plan, expectedShape());

    expect(fake.state.history).toEqual([
      { hash: MIGRATION.hash, created_at: MIGRATION.when },
    ]);
    const texts = writes(fake.statements).map(({ text }) => text);
    expect(texts[0]).toBe('CREATE SCHEMA IF NOT EXISTS "drizzle"');
    expect(texts[1]).toContain(
      'CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations"',
    );
    expect(texts[1]).toContain("id SERIAL PRIMARY KEY");
    expect(texts[1]).toContain("hash text NOT NULL");
    expect(texts[1]).toContain("created_at bigint");
    expect(texts[2]).toContain("IN EXCLUSIVE MODE");
    // Only drizzle's own bookkeeping is written: never DDL on application tables.
    expect(texts).toHaveLength(4);
    expect(fake.statements.at(-1)?.params).toEqual([
      MIGRATION.hash,
      MIGRATION.when,
    ]);
  });

  it("will not apply a plan that is not ready", async () => {
    const tables = withoutSession();
    const fake = fakeDb({ tables });
    const plan = await planBaseline(fake.db, MIGRATION, expectedShape());
    await expect(applyBaseline(fake.db, plan, expectedShape())).rejects.toThrow(
      /refusing/,
    );
    expect(writes(fake.statements)).toEqual([]);
  });

  it("aborts without inserting when the database changed after planning", async () => {
    const fake = fakeDb({ tables: matchingTables() });
    const plan = await planBaseline(fake.db, MIGRATION, expectedShape());
    // Another process baselines (or migrates) between plan and apply.
    fake.state.history = [{ hash: "other", created_at: "99" }];
    await expect(applyBaseline(fake.db, plan, expectedShape())).rejects.toThrow(
      /changed while baselining/,
    );
    expect(
      fake.statements.some(({ text }) => text.startsWith("insert into")),
    ).toBe(false);
  });
});
