import { createHash } from "node:crypto";

/**
 * Logic behind `db:baseline`: record the baseline migration as applied in an
 * existing database whose schema already matches it, without running its DDL.
 *
 * What drizzle-orm's postgres migrator reads and writes (drizzle-orm 0.44.7,
 * the version @repo/database pins; drizzle-kit's `migrate` calls the driver
 * migrators, which all call `db.dialect.migrate`):
 *
 * - table `drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT
 *   NULL, created_at bigint)`, created when missing: schema and table defaults
 *   at drizzle-orm/pg-core/dialect.js:45-46, DDL at :48-52.
 * - it reads only the newest row (`order by created_at desc limit 1`, :57) and
 *   runs every journal entry whose `when` is greater than that row's
 *   created_at (:62), then inserts `hash` and `created_at = when` (:67).
 * - `hash` is the sha256 hex of the whole .sql file and `when` is the journal
 *   entry's `when` (drizzle-orm/migrator.js:22-23).
 *
 * So a baselined database needs exactly one row: the baseline file's hash and
 * its journal `when`. Later migrations then apply normally.
 */

const MIGRATIONS_SCHEMA = "drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";

export interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

export interface BaselineMigration extends JournalEntry {
  /** sha256 hex of the .sql file, exactly as drizzle-orm computes it. */
  hash: string;
}

interface SnapshotColumn {
  name: string;
  notNull?: boolean;
}

interface SnapshotTable {
  name: string;
  schema?: string;
  columns: Record<string, SnapshotColumn>;
}

export interface Snapshot {
  tables: Record<string, SnapshotTable>;
}

/** Column facts the comparison uses: names and nullability, not types. */
interface ColumnFacts {
  notNull: boolean;
}

/** "schema.table" -> column name -> facts. */
export type SchemaShape = Map<string, Map<string, ColumnFacts>>;

export interface Queryable {
  query<Row = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<Row[]>;
}

export interface TransactionalQueryable extends Queryable {
  transaction<T>(run: (tx: Queryable) => Promise<T>): Promise<T>;
}

export function hashMigration(sqlText: string): string {
  return createHash("sha256").update(sqlText).digest("hex");
}

export function pickBaseline(
  journal: { entries: JournalEntry[] },
  readSql: (tag: string) => string,
  tag?: string,
): BaselineMigration {
  const entry = tag
    ? journal.entries.find((candidate) => candidate.tag === tag)
    : journal.entries[0];
  if (!entry) {
    throw new Error(
      tag
        ? `no journal entry tagged "${tag}"`
        : "the migration journal has no entries; run db:generate first",
    );
  }
  return { ...entry, hash: hashMigration(readSql(entry.tag)) };
}

export function shapeFromSnapshot(snapshot: Snapshot): SchemaShape {
  const shape: SchemaShape = new Map();
  for (const table of Object.values(snapshot.tables)) {
    const columns = new Map<string, ColumnFacts>();
    for (const column of Object.values(table.columns)) {
      columns.set(column.name, { notNull: column.notNull === true });
    }
    shape.set(`${table.schema || "public"}.${table.name}`, columns);
  }
  return shape;
}

interface ColumnRow {
  table_schema: string;
  table_name: string;
  column_name: string;
  is_nullable: string;
}

/** Reads the live shape of the given schemas (base tables only, no views). */
async function readLiveShape(
  db: Queryable,
  schemas: string[],
): Promise<SchemaShape> {
  const rows = await db.query<ColumnRow>(
    `select c.table_schema, c.table_name, c.column_name, c.is_nullable
       from information_schema.columns c
       join information_schema.tables t
         on t.table_schema = c.table_schema
        and t.table_name = c.table_name
      where t.table_type = 'BASE TABLE'
        and c.table_schema = any($1::text[])
      order by c.table_schema, c.table_name, c.ordinal_position`,
    [schemas],
  );
  const shape: SchemaShape = new Map();
  for (const row of rows) {
    const key = `${row.table_schema}.${row.table_name}`;
    const columns = shape.get(key) ?? new Map<string, ColumnFacts>();
    columns.set(row.column_name, { notNull: row.is_nullable === "NO" });
    shape.set(key, columns);
  }
  return shape;
}

export interface ShapeDiff {
  missingTables: string[];
  extraTables: string[];
  missingColumns: string[];
  extraColumns: string[];
  nullabilityMismatches: string[];
}

export function diffShape(expected: SchemaShape, live: SchemaShape): ShapeDiff {
  const diff: ShapeDiff = {
    missingTables: [],
    extraTables: [],
    missingColumns: [],
    extraColumns: [],
    nullabilityMismatches: [],
  };
  for (const [table, columns] of expected) {
    const liveColumns = live.get(table);
    if (!liveColumns) {
      diff.missingTables.push(table);
      continue;
    }
    for (const [name, facts] of columns) {
      const liveFacts = liveColumns.get(name);
      if (!liveFacts) diff.missingColumns.push(`${table}.${name}`);
      else if (liveFacts.notNull !== facts.notNull) {
        diff.nullabilityMismatches.push(
          `${table}.${name} (expected ${facts.notNull ? "NOT NULL" : "nullable"})`,
        );
      }
    }
    for (const name of liveColumns.keys()) {
      if (!columns.has(name)) diff.extraColumns.push(`${table}.${name}`);
    }
  }
  for (const table of live.keys()) {
    if (!expected.has(table)) diff.extraTables.push(table);
  }
  for (const list of Object.values(diff)) list.sort();
  return diff;
}

export function managedSchemas(expected: SchemaShape): string[] {
  const schemas = new Set<string>(["public"]);
  for (const key of expected.keys()) schemas.add(key.split(".")[0]);
  return [...schemas].sort();
}

interface HistoryRow {
  hash: string;
  created_at: string | number | null;
}

type BaselineState =
  | { kind: "ready" }
  | { kind: "already-baselined" }
  | { kind: "refused"; reasons: string[] };

export interface BaselinePlan {
  migration: BaselineMigration;
  diff: ShapeDiff;
  state: BaselineState;
}

export interface PlanOptions {
  /** Tolerate tables/columns the baseline does not know about. */
  allowExtra?: boolean;
}

async function readHistory(db: Queryable): Promise<HistoryRow[]> {
  const found = await db.query<{ present: string | null }>(
    "select to_regclass($1) as present",
    [`${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`],
  );
  if (!found[0]?.present) return [];
  return db.query<HistoryRow>(
    `select hash, created_at from "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" order by created_at`,
  );
}

function describeDiff(diff: ShapeDiff, allowExtra: boolean): string[] {
  const reasons: string[] = [];
  const add = (label: string, items: string[]): void => {
    if (items.length > 0) reasons.push(`${label}: ${items.join(", ")}`);
  };
  add("tables missing from the database", diff.missingTables);
  add("columns missing from the database", diff.missingColumns);
  add("columns with different nullability", diff.nullabilityMismatches);
  if (!allowExtra) {
    add(
      "tables in the database that the baseline does not define",
      diff.extraTables,
    );
    add(
      "columns in the database that the baseline does not define",
      diff.extraColumns,
    );
  }
  return reasons;
}

/** Read-only: decides whether baselining is safe. Never writes. */
export async function planBaseline(
  db: Queryable,
  migration: BaselineMigration,
  expected: SchemaShape,
  options: PlanOptions = {},
): Promise<BaselinePlan> {
  const live = await readLiveShape(db, managedSchemas(expected));
  const diff = diffShape(expected, live);
  const history = await readHistory(db);
  const reasons = describeDiff(diff, options.allowExtra === true);

  if (history.length > 0) {
    const matches =
      history.length === 1 &&
      history[0].hash === migration.hash &&
      Number(history[0].created_at) === migration.when;
    if (matches && reasons.length === 0) {
      return { migration, diff, state: { kind: "already-baselined" } };
    }
    reasons.unshift(
      matches
        ? "the baseline is already recorded but the schema no longer matches it"
        : `${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE} already has ${history.length} row(s) that are not exactly the baseline; this database has a migration history, use db:migrate instead`,
    );
  }
  if (reasons.length > 0) {
    return { migration, diff, state: { kind: "refused", reasons } };
  }
  return { migration, diff, state: { kind: "ready" } };
}

/**
 * Writes the baseline row. The migrations table is created with the same DDL
 * drizzle-orm uses (dialect.js:46-52). Everything runs in one transaction under
 * an exclusive table lock, and the history is re-read after the lock so two
 * concurrent runs cannot both insert.
 */
export async function applyBaseline(
  db: TransactionalQueryable,
  plan: BaselinePlan,
  expected: SchemaShape,
  options: PlanOptions = {},
): Promise<void> {
  if (plan.state.kind !== "ready") {
    throw new Error(`refusing to apply a plan in state "${plan.state.kind}"`);
  }
  const { migration } = plan;
  await db.transaction(async (tx) => {
    await tx.query(`CREATE SCHEMA IF NOT EXISTS "${MIGRATIONS_SCHEMA}"`);
    await tx.query(
      `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at bigint
			)`,
    );
    await tx.query(
      `LOCK TABLE "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" IN EXCLUSIVE MODE`,
    );
    const recheck = await planBaseline(tx, migration, expected, options);
    if (recheck.state.kind !== "ready") {
      throw new Error(
        `the database changed while baselining (${recheck.state.kind}); nothing was written`,
      );
    }
    await tx.query(
      `insert into "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" ("hash", "created_at") values ($1, $2)`,
      [migration.hash, migration.when],
    );
  });
}
