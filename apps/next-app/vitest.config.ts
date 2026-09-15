import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/test-server-only.ts"),
      "@repo/database/schema-agent-auth": path.resolve(
        __dirname,
        "../../packages/database/src/schema-agent-auth.ts",
      ),
      "@repo/database/schema": path.resolve(
        __dirname,
        "../../packages/database/src/schema.ts",
      ),
      "@repo/database": path.resolve(
        __dirname,
        "../../packages/database/src/index.ts",
      ),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
