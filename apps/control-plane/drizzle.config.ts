import { defineConfig } from 'drizzle-kit';

// `drizzle-kit generate` only diffs the schema; it needs no database. The URL
// is for `drizzle-kit studio`/`push` against a local database.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ?? 'postgresql://localhost:5432/control_plane',
  },
});
