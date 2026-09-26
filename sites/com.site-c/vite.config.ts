import { fileURLToPath } from "node:url";
import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

// SolidStart 2 builds directly on Vite 8 (no Vinxi). `nitro()` is the
// deployment plugin; it detects Vercel during the build and emits the output
// Vercel deploys as-is, so no preset argument is needed.
//
// `middleware` points at src/http/tenant-guard.ts. It must NOT be named
// middleware.ts at any depth: scripts/check-no-middleware.ts blocks that
// filename repo-wide (it is the Next.js 16 convention this site does not use).
export default defineConfig(({ mode }) => {
  // Next.js populates `process.env` from .env / .env.local automatically. Vite
  // does not: it only exposes prefixed vars through `import.meta.env`. Without
  // this, DATABASE_URL — which @repo/database reads straight from process.env —
  // would be missing in dev and in the built server, and .env.development's
  // SITE_TENANT_ID pin would be ignored. loadEnv is given an empty prefix so
  // unprefixed server vars load too, and existing process.env values win so real
  // environment variables (Vercel, CI) are never overwritten.
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ""))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
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
  };
});
