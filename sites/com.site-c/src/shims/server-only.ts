/**
 * No-op stand-in for the React-only `server-only` marker package.
 *
 * `@solidjs/start/middleware` imports `server-only`, whose default entry
 * throws unless the `react-server` export condition is set. SolidStart never
 * sets that condition, so Vite's dev SSR module runner inlines the throwing
 * entry and every request 500s. (The production build happens not to include
 * it, so this only shows up in `bun run dev`.)
 *
 * Aliasing to this file makes the marker a no-op. That is safe here: the only
 * module in this app's graph that imports `server-only` is SolidStart's own
 * middleware, which genuinely is server-side and is loaded only in the ssr
 * environment. We lose React's guard against accidentally importing a server
 * module from a client component, which Solid does not have anyway.
 *
 * See the `resolve.alias` entry in vite.config.ts.
 */
export {};
