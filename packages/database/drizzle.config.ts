import { resolve } from "node:path";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load .env.local from monorepo root
config({ path: resolve(__dirname, "../../.env.local") });

export default defineConfig({
  schema: [
    "./src/schema.ts",
    "./src/schema-agent-auth.ts",
    "./src/schema-agents.ts",
    "./src/schema-analytics.ts",
    "./src/schema-ext.ts",
    "./src/schema-operators.ts",
    "./src/schema-admin.ts",
  ],
  schemaFilter: ["public", "archived"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
});
