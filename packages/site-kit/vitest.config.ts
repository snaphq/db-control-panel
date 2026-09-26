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
        find: /^@repo\/(core|ui|site-kit)\/(.*)$/,
        replacement: `${path.resolve(__dirname, "..")}/$1/src/$2`,
      },
      { find: /^@repo\/database$/, replacement: `${pkg("database")}/index.ts` },
      { find: /^@repo\/database\/(.*)$/, replacement: `${pkg("database")}/$1` },
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
