import { fileURLToPath } from "node:url";
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { loadEnv } from "vite";

// Vite only exposes .env* files through import.meta.env, while @repo/database
// and the tenant guard read process.env directly. Next.js sites get this via
// next.config.ts; Astro has no equivalent, so copy the loaded env into
// process.env without overwriting real environment variables. Same fix as
// sites/com.site-c/vite.config.ts.
const loadedEnv = loadEnv(
  process.env.NODE_ENV ?? "development",
  process.cwd(),
  "",
);
for (const [key, value] of Object.entries(loadedEnv)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

export default defineConfig({
  site: process.env.SITE_URL ?? "https://starter-astro-stack.vercel.app",
  output: "server",
  adapter: vercel(),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        // @repo/auth imports React's `server-only` marker, whose default entry
        // throws unless the react-server export condition is set. Astro never
        // sets it, so point the marker at an empty module.
        "server-only": fileURLToPath(
          new URL("./src/shims/server-only.ts", import.meta.url),
        ),
      },
      dedupe: ["react", "react-dom"],
    },
    server: {
      // Browsers share cookies across localhost ports, so test alongside the
      // other sites through com-site-d.localhost hosts.
      allowedHosts: ["localhost", "127.0.0.1", ".localhost"],
    },
  },
});
