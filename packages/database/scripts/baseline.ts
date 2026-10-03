#!/usr/bin/env bun
/**
 * Records the baseline migration as applied in an EXISTING web-app database
 * (one that was created with `db:push` and has no drizzle.__drizzle_migrations
 * table), without running any DDL against your tables.
 *
 *   DATABASE_URL=postgresql://... bun run --filter @repo/database db:baseline
 *   DATABASE_URL=postgresql://... bun run --filter @repo/database db:baseline --apply
 *
 * Dry-run by default: it reads the live schema, compares it with the baseline
 * migration's snapshot and prints the verdict. `--apply` writes one row to
 * drizzle.__drizzle_migrations, and only when the schema matches. Options:
 *   --apply          write the baseline row
 *   --tag <tag>      baseline migration (default: the first journal entry)
 *   --allow-extra    tolerate tables/columns the baseline does not define
 *
 * Only DATABASE_URL (environment, or the root .env.local like drizzle.config.ts)
 * selects the database; it is never taken from argv so it stays out of history.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import postgres from "postgres";
import {
  type Queryable,
  type Snapshot,
  type TransactionalQueryable,
  applyBaseline,
  pickBaseline,
  planBaseline,
  shapeFromSnapshot,
} from "./baseline-lib";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, "../drizzle");

function fail(message: string): never {
  process.stderr.write(`db:baseline: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const options = {
    apply: false,
    allowExtra: false,
    tag: undefined as string | undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--allow-extra") options.allowExtra = true;
    else if (arg === "--tag") {
      index += 1;
      options.tag = argv[index];
      if (!options.tag) fail("--tag needs a value");
    } else fail(`unknown argument: ${arg}`);
  }
  return options;
}

/** Host and database name only: never print credentials. */
function describeTarget(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  config({ path: resolve(here, "../../../.env.local") });
  const url = process.env.DATABASE_URL?.trim();
  if (!url) fail("DATABASE_URL is not set");

  const journal = readJson<{
    entries: { idx: number; tag: string; when: number }[];
  }>(resolve(migrationsDir, "meta/_journal.json"));
  const migration = pickBaseline(
    journal,
    (tag) => readFileSync(resolve(migrationsDir, `${tag}.sql`), "utf8"),
    options.tag,
  );
  const snapshotName = `${String(migration.idx).padStart(4, "0")}_snapshot.json`;
  const expected = shapeFromSnapshot(
    readJson<Snapshot>(resolve(migrationsDir, "meta", snapshotName)),
  );

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const queryable = (client: typeof sql): Queryable => ({
    query: async (text, params) =>
      (await client.unsafe(text, (params ?? []) as never[])) as never,
  });
  const db: TransactionalQueryable = {
    ...queryable(sql),
    transaction: (run) =>
      sql.begin(async (tx) =>
        run(queryable(tx as unknown as typeof sql)),
      ) as never,
  };

  try {
    process.stdout.write(
      `Target: ${describeTarget(url)}\nBaseline: ${migration.tag} (hash ${migration.hash.slice(0, 12)}, when ${migration.when})\n`,
    );
    const plan = await planBaseline(db, migration, expected, {
      allowExtra: options.allowExtra,
    });
    if (plan.state.kind === "refused") {
      process.stderr.write("REFUSED. Nothing was written.\n");
      for (const reason of plan.state.reasons)
        process.stderr.write(`  - ${reason}\n`);
      process.exitCode = 1;
      return;
    }
    if (plan.state.kind === "already-baselined") {
      process.stdout.write("Already baselined; nothing to do.\n");
      return;
    }
    if (!options.apply) {
      process.stdout.write(
        `The schema matches ${expected.size} baseline tables. Dry run: nothing was written.\nRe-run with --apply to record the baseline.\n`,
      );
      return;
    }
    await applyBaseline(db, plan, expected, { allowExtra: options.allowExtra });
    process.stdout.write(
      "Baseline recorded in drizzle.__drizzle_migrations. `db:migrate` now applies only newer migrations.\n",
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
