import { fileURLToPath } from "node:url";
import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// SolidStart 2 builds directly on Vite 8 (no Vinxi). `nitro()` is the
// deployment plugin; it detects Vercel during the build and emits the output
// Vercel deploys as-is, so no preset argument is needed.
//
// `middleware` points at src/http/tenant-guard.ts. It must NOT be named
// middleware.ts at any depth: scripts/check-no-middleware.ts blocks that
// filename repo-wide (it is the Next.js 16 convention this site does not use).
export default defineConfig({
  plugins: [
    tailwindcss(),
    solidStart({ middleware: "./src/http/tenant-guard.ts" }),
    nitro(),
  ],
  resolve: {
    alias: {
      // See src/shims/server-only.ts for why this is needed.
      "server-only": fileURLToPath(
        new URL("./src/shims/server-only.ts", import.meta.url),
      ),
    },
  },
  server: {
    // Every site runs on localhost during development, so the tenant is
    // disambiguated by hostname. multi-site.mdx requires <site>.localhost:8803
    // to test this site alongside the others without sharing a cookie jar.
    allowedHosts: true,
  },
});
