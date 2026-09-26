import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/test-server-only.ts"),
      "@repo/core": path.resolve(__dirname, "../../packages/core/src"),
      "@repo/ui": path.resolve(__dirname, "../../packages/ui/src"),
      "@repo/database/schema-agent-auth": path.resolve(
        __dirname,
        "../../packages/database/src/schema-agent-auth.ts",
      ),
      "@repo/database/schema-operators": path.resolve(
        __dirname,
        "../../packages/database/src/schema-operators.ts",
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
