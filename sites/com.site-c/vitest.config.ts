import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // No `server-only` alias here. Vitest externalizes node_modules, so a
    // Vite alias cannot reach the marker package; tests that pull in
    // @solidjs/start mock that module instead.
  },
});
