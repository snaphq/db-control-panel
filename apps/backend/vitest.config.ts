import path from "node:path";
import { defineConfig } from "vitest/config";

const packages = path.resolve(__dirname, "../../packages");

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@\/(.*)$/,
        replacement: `${path.resolve(__dirname, "src")}/$1`,
      },
      {
        find: /^@repo\/(core|ui)\/(.*)$/,
        replacement: `${packages}/$1/src/$2`,
      },
      {
        find: /^@repo\/database$/,
        replacement: `${packages}/database/src/index.ts`,
      },
      {
        find: /^@repo\/database\/(.*)$/,
        replacement: `${packages}/database/src/$1`,
      },
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
