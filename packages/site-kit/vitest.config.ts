import path from "node:path";
import { defineConfig } from "vitest/config";

const pkg = (name: string) => path.resolve(__dirname, "..", name, "src");

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "server-only",
        replacement: path.resolve(__dirname, "src/test-server-only.ts"),
      },
      {
        find: /^@repo\/(core|react-ui|site-kit)\/(.*)$/,
        replacement: `${path.resolve(__dirname, "..")}/$1/src/$2`,
      },
      // Shared routes read site-owned modules through @site/*; tests use the
      // first site as the reference implementation of that contract.
      {
        find: /^@site\/(.*)$/,
        replacement: `${path.resolve(__dirname, "../../sites/com.site-a/src")}/$1`,
      },
      { find: /^@repo\/database$/, replacement: `${pkg("database")}/index.ts` },
      { find: /^@repo\/database\/(.*)$/, replacement: `${pkg("database")}/$1` },
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
