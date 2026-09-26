# `com.site-c` — standalone Solid/Hono/Effect tenant site

**Status:** Phases 1–9 complete, pushed to `origin/main`
**Date:** 2026-09-26
**Baseline:** local `main` at `026798d`
**Commits:** `177bbd9` scaffold · `7c6bb05` tenant resolution ·
`9e96f1d` auth · `9677a3d` dashboard, CI, docs

## What is verified, and what is not

Verified by running it:

- `vite build` and `tsc --noEmit` clean for the site; `site-kit` and `auth`
  still typecheck after the `SiteConfig` split and the auth change.
- All 6 existing package test suites pass, plus 10 new site tests.
- The dev server serves the dashboard: SSR HTML contains the shell, the three
  nav items, the page header and the stat tiles.
- Every route is gated by the guard — `/overview`, `/logs`, `/` and an unknown
  path all 404 for an unrecognized Host, and a Host carrying a scheme is
  rejected too.
- All nine repo checks pass, and both knip and fallow are clean against baseline.
- `check-doc-coverage` (37 entries) and the Mintlify broken-link check pass.

**Not verified — needs a real `DATABASE_URL`:** tenant seeding, the real
`resolveTenantFromHost` lookup, and the Overview/Logs/Go data rendering. The
dashboard was confirmed to render its shell, but every number on it came back
empty because the Neon driver cannot connect.

## Phase 9 outcome

`rename-site.ts` turned out to need **no** change: it is driven by `--from` /
`--to` and does not hardcode a site list, so it already handles `com.site-c`.
Only its header comment listed the two placeholders. The real work was
`multi-site.mdx` and `AGENTS.md`, which both said "copy `com.site-b`" as though
that were the only option; they now describe the standalone path and the fact
that omitting `@repo/site-kit` is the whole opt-out.

## Auth: how the Next coupling was removed

The audit said `@repo/auth` was "7/8 reusable". In practice the Next coupling
was only two call sites, and both are now avoidable without duplicating the
package:

- `createAuthInstance` takes a new `cookieDelivery` option, `"next"` (default,
  so every existing site is byte-identical) or `"response"`. Under `"response"`
  Better Auth's `nextCookies` plugin is omitted. It exists only to re-apply
  `Set-Cookie` through Next's `cookies()` API; SolidStart returns the Response
  as-is, so it is genuinely unnecessary rather than merely unused.
- `getApiHandler()` now `await import("better-auth/next-js")` instead of
  importing it at module scope, so a non-Next consumer never pulls
  `next/headers` into its graph. Both existing callers already awaited it.
- The site mounts `/api/auth/*` in Hono and calls
  `getBetterAuthServer({ cookieDelivery: "response" }).getAuthInstance().handler`.
  One instance serves all tenants: every read and write is bound by
  `withTenantBoundAuthAdapter`.

Verified: the client bundle contains no Next internals. The server bundle still
carries ~160KB of Next edge runtime because the `nextCookies` import must stay
static to keep plugin construction synchronous; it is never executed under
`"response"`. Documented in the option's JSDoc rather than contorted away.

`@repo/auth`'s `peerDependencies` on `next` and `react` are still declared.
They resolve from the workspace, and nothing Next-specific executes, but if the
site is ever split into its own install this is the line to revisit.

## Environment blocker: no database

`@repo/database` uses `@neondatabase/serverless`, whose `neon()` driver speaks
Neon's HTTP API, so a local plain Postgres cannot serve it. There is no root
`.env.local` and no reachable Neon instance in this environment, so
`bun run db:seed:sites` and every DB-backed path are **unverified**.

What that blocks: tenant seeding, the real `resolveTenantFromHost` lookup, and
the Overview / Logs data reads. What it does not block: the guard's
no-database branches (verified live), and the isolation test (mocks
`@repo/database`, following `packages/core/src/tenant-isolation.test.ts`).

Note for whoever runs setup: `link-env.ts` already enumerates every `sites/*`
directory, so this site gets the root `.env.local` symlink with no change.

## Implementation notes

Recorded as they were discovered, because several differ from the plan above.

- **SolidStart 2 is h3-based, not Vinxi-based.** `createMiddleware` from
  `@solidjs/start/middleware` takes an array of **h3** `Middleware`, so the
  callback receives an `H3Event`, not a `FetchEvent`. Use `event.url.pathname`
  and `event.req` — not `event.request.url`, which is `undefined` and throws.
  `@solidjs/start/server`'s own `createFetchEvent` assigns `FetchEvent.request`
  from `H3Event.req`, so they are the same object.
- **Hono needs no adapter.** `Hono.fetch(request)` is already web-standard, so
  `api.fetch(event.req)` bridges directly. `hono/web-standard` does not exist
  in hono 4.13.9.
- **`server-only` shim required.** `@solidjs/start/middleware` imports the
  React-only `server-only` marker, whose default entry throws unless the
  `react-server` export condition is set. SolidStart never sets it, so every
  request 500s in `bun run dev` (the production build happens not to include
  it, so this only reproduces in dev). Fixed with a `resolve.alias` to
  `src/shims/server-only.ts`, an empty module. Aliasing to
  `server-only/empty.js` does **not** work: that package's `exports` map only
  defines `"."`.
- **`SiteConfig` was split, not unioned.** Making `SiteConfig` itself a
  discriminated union broke site-kit's shared routes, which legitimately read
  `siteConfig.mcp` and `siteConfig.markdown` (`app/mcp/route.ts`,
  `lib/agent-discovery.ts`, two tests). Instead: `SiteConfigBase`,
  `SiteConfig` (site-kit, `stack?`), `StandaloneSiteConfig` (`stack:
  "standalone"`), and `AnySiteConfig` for the seed script. Existing sites and
  shared routes are untouched.
- **`seed-site-tenants.ts` needed no logic change.** It only reads identity
  fields, which all live on `SiteConfigBase`, so widening its type to
  `AnySiteConfig` was sufficient. It also had to keep validating that a
  `site.config.ts` exports `siteConfig`, which now guards standalone sites too.
- **`tsconfig` types are `vite/client` + `@solidjs/start/env`**, not
  `vinxi/types/client` — Vinxi is gone in v2.
- **`biome.json` needed `**/.output/**` and `**/.vercel/**` ignores.** Biome
  does not read `.gitignore`, so it was linting compiled Tailwind and the
  SolidStart dev-toolbar CSS in the build output (270 errors).
- **Nitro picks its preset at build time.** Locally it resolves
  `node-server` and emits `.output/server/index.mjs`, which is what the
  `start` script runs. On Vercel it detects the platform and emits the Vercel
  output. So `vercel.json` correctly sets neither `framework` nor
  `outputDirectory`.
- **`@repo/site-kit` must stay out of the site's dependencies.** The
  `SiteConfig` import in `site.config.ts` is type-only and resolves through a
  tsconfig path mapping instead, because `scripts/sync-site-routes.ts` selects
  sites to generate Next.js shims for by exactly that dependency.
- **Deferred to their phases:** `@repo/auth` and `@repo/analytics` both declare
  `peerDependencies` on `next` and `react`, so they cannot be added as-is. They
  are not yet dependencies; Phases 4 and the analytics work must deal with the
  peer ranges first.

## Objective

Add a third tenant site, `sites/com.site-c`, built on the SolidStart + Hono +
Effect stack, sharing the repo's single `DATABASE_URL` but owning its own
tenant identity, its own docs, and its own Vercel deploy entry. It is a
**template fixture** (a third example site), so setup and docs learn about it
alongside `com.site-a` / `com.site-b`.

## Locked decisions

| # | Decision |
|---|---|
| Stack | SolidStart 2 + Hono + Effect, Vite 8, `nitro()` deployment plugin |
| Location | `sites/com.site-c` — **no** `@repo/site-kit` dependency |
| Tenant | New `tenant` + `tenant_domain` row, host-resolved, `tenantId: "site-c"` |
| Identity | folder `sites/com.site-c` · package `com.site-c` · slug `site-c` · name `Site C` · domain `site-c.vercel.app` · port **8803** |
| Nav | Horizontal top bar on desktop, left sidebar below `48rem` |
| Styling | Hybrid — Tailwind 4 for layout, one scoped CSS file for nav details |
| Analytics | Solid PostHog provider inside the site; reuse neutral `@repo/analytics` entries |
| Scope | Dashboard: **Overview · Logs · Go** |
| Deploy | Vercel only, existing `W3Dev/vercel-deploy@main` action, matrix rows in the two existing workflows |

## Reuse audit

11 of 13 packages are framework-neutral; ~200 of ~436 package files come across
unchanged. Duplication is confined to four surfaces:

| Surface | Cost | Action |
|---|---|---|
| `packages/ui` (88 React files) | High, unavoidable | Build only the primitives the 3 pages use |
| `packages/auth/src/client.ts` | 1 file | `better-auth/react` → `better-auth/solid` |
| `packages/analytics` (`posthog-provider.tsx`, `hooks.ts`) | 2 files | Solid provider in-site |
| `packages/core` (9 of 54 Next-coupled) | Low | Thin Hono adapters |

`packages/core/src/tenant.ts` is 20 lines (`headers()` + `resolveTenantFromHost`
+ `notFound()`); its Hono equivalent is ~8. `packages/billing` (24 files) and
`packages/core/src/subscription.ts` are fully reusable for Overview/Go.

`Effect`, `Solid`, and `Hono` have **zero existing usage** in the repo — net-new
toolchain with no in-repo precedent.

## Version decisions (verified against the npm registry, 2026-09-26)

The opencode repo pins a `pkg.pr.new` prerelease of `@solidjs/start` plus
`effect@4.0.0-rc.112` and `nitro@3.0.1-alpha.1`. This site uses **released**
versions instead, because it deploys to production:

| Package | Pin | Note |
|---|---|---|
| `@solidjs/start` | `2.0.5` | v2 is stable and **replaces Vinxi with direct Vite 8** |
| `vite` | `8.3.1` | forced: `@solidjs/start@2.0.5` peer-requires `^8 \|\| ^9` |
| `nitro` | `3.0.260903-beta` | still beta; it is what `npm i nitro` resolves today |
| `solid-js` | `1.9.15` | same as opencode |
| `@solidjs/router` | `1.0.0` | same as opencode |
| `@solidjs/meta` | `0.29.4` | same as opencode |
| `hono` | `4.13.9` | stable |
| `effect` | `3.22.2` | **stable**, not opencode's `4.0.0-rc.112` |
| `tailwindcss` / `@tailwindcss/vite` | `4.3.3` | Vite plugin, since this app is not PostCSS |

## Deploy findings (SolidStart 2 on Vercel)

Per Vercel's Solid guide and the SolidStart v2 deployment-plugin docs:

- Deploy via `plugins: [solidStart(), nitro()]`. Nitro auto-detects Vercel, so
  **no preset argument is needed**. (`preset: "vercel"` is the SolidStart **1**
  API via `app.config.ts`; opencode uses `preset: "cloudflare-module"`.)
- Build script must be `vite build`, **not** `vinxi build`.
- **Node.js 24+ is required.** The existing deploy workflows pass
  `node_version: '22'` to the action. See the blocker below.
- `outputDirectory` must be **left unset** — the SolidStart preset's `.output`
  default belongs to SolidStart 1; the Nitro plugin owns the output.
- Vercel auto-detects the SolidStart preset from `solid-js` + `@solidjs/start`
  in the site manifest, so `"framework": "nextjs"` must **not** be copied from
  `sites/com.site-b/vercel.json`.

### Blocker: Node 22 in the shared deploy matrix

`deploy-vercel.yml` and `deploy-vercel-preview.yml` hardcode
`node_version: '22'` for every matrix row. SolidStart 2 needs 24. Resolution:

1. Add `"engines": { "node": "24.x" }` to the site manifest — this pins the
   Vercel **build** Node and overrides project settings.
2. Promote `node_version` to a per-row matrix field so the `site-c` row passes
   `24` while `site-a` / `site-b` / `backend` keep `22`. Minimal change; does
   not alter existing deploys.

## Phases

### Phase 1 — Catalog and toolchain

1. Add the versions above to the root `package.json` `catalog`.
2. `bun install && bun run check:catalog-deps` (pre-commit hook).
3. Extend `turbo.json` `build.outputs` with `.output/**` and
   `.vercel/output/**`; today it is only `.next/**` and `dist/**`, so the Solid
   build would cache incorrectly.
4. Add `.output/` to `.gitignore` (has `.next/`, `dist`, `.vercel`).
5. Root script `dev:site-c`.

### Phase 2 — Scaffold

6. `sites/com.site-c/package.json` — `dev` (8803), `build` (`vite build`),
   `start`, `lint`/`format` (Biome), `test` (Vitest), `engines.node 24.x`.
   **Omit `@repo/site-kit`** — this is the complete opt-out:
   `scripts/sync-site-routes.ts:200-213` filters candidate sites on
   `dependencies["@repo/site-kit"]`.
7. `vite.config.ts` — `solidStart({ middleware: "./src/http/tenant-guard.ts" })`
   then `nitro()`. The filename **must not** be `middleware.ts` at any depth:
   `check-no-middleware` blocks it. Keep `server.allowedHosts: true` so
   `<site>.localhost:8803` resolves.
8. `tsconfig.json` — extends root; override `"jsx": "preserve"` and
   `"jsxImportSource": "solid-js"`; map `@repo/*` and `@/*`.
9. `src/entry-client.tsx`, `src/entry-server.tsx` (Hono mounted at `/api/*`),
   `src/app.tsx` (`<Router>` + `FileRoutes`).
10. `src/styles/globals.css` — Tailwind 4 via `@tailwindcss/vite`, plus the
    scoped nav CSS (geometry, active indicator, `48rem` breakpoint,
    horizontal-scroll hide-scrollbar).
11. `.env.development` — app URL, `BETTER_AUTH_URL`, `SITE_TENANT_ID=site-c`.
    The Next sites pin this in `next.config.ts` `env:`; SolidStart needs it
    here or in Vite `define`.
12. `vercel.json` — `installCommand`/`buildCommand` with `cd ../..`; **no**
    `framework`, **no** `outputDirectory`.
13. `start` script must work under the Dockerfile's `bun run start` pattern
    (the Dockerfile is already parameterized by `APP_DIR`/`APP_PACKAGE`/`PORT`,
    so it needs no change).

### Phase 3 — Tenant identity

14. Widen `SiteConfig` in `packages/site-kit/src/site-config.ts` into a
    discriminated union on `stack`:
    ```ts
    type SiteConfig = SiteConfigBase & (
      | { stack?: "site-kit";  markdown: ...; mcp: {...} }
      | { stack: "standalone"; markdown?: ...; mcp?: {...} }
    )
    ```
    `stack` stays optional on the site-kit branch so `com.site-a` / `com.site-b`
    need zero edits, and this site declares `stack: "standalone"` without
    lying about `markdown` / `mcp`.
15. `src/site.config.ts` — `stack: "standalone"`, `tenantId: "site-c"`,
    `tenantSlug: "site-c"`, `domain: "site-c.vercel.app"`, `publicPaths`.
16. Teach `scripts/seed-site-tenants.ts` both shapes via the discriminator; it
    must keep rejecting two sites that claim one `tenantId`.
17. Tenant resolution: call `resolveTenantFromHost` from `@repo/database` in
    `src/http/tenant-guard.ts`; replace `core/tenant.ts` with an ~8-line Hono
    version. Never trust a client-supplied tenant id.
18. `bun run db:seed:sites`.

### Phase 4 — Auth

19. Reuse `packages/auth/src/tenant-binding.ts` **unchanged** — it is what
    throws on an unbound tenant write, and it is framework-neutral.
20. New `auth.ts` mirroring `auth-instance.ts` (`betterAuth()`,
    `drizzleAdapter`, plugins `organization` / `twoFactor` / `oidcProvider` /
    `passkey`, `buildTenantAuthEmail`) minus `nextCookies`; use the SolidStart
    cookie equivalent.
21. `better-auth/solid` client.
22. Mount the handler at `/api/auth/*`.

### Phase 5 — UI kit and dashboard

23. Build only the primitives the three pages need (nav, section, table, stat
    tile). Do not port all 88 `ui` files.
24. Nav: horizontal on desktop with a 2px bottom-underline active marker; left
    sidebar below `48rem` with a 2px left-border marker — mirroring opencode's
    `workspace/[id].css` treatments.
25. Routes under `src/routes/`:
    - **Overview** — usage rollups; reuse `@repo/billing` and
      `packages/billing/src/subscription.ts`.
    - **Logs** — `org_audit_logs` for the tenant (action, from -> to, actor,
      timestamp), paginated. Joined to `organization` because the audit table
      has no `tenant_id` of its own.
    - **Go** — per-organization plan state from `org_billing` plus `plan_tier`
      display fields and any `org_features` overrides.

### Correction: there is no `UsageTable` in this repo

The original plan specified a per-request usage log modelled on opencode's
console. That table does not exist here — mcp-crm has no request/usage log at
all. The real sources are:

| Page | Table | Notes |
| --- | --- | --- |
| Overview | `organization`, `org_billing` | count orgs, plan/status breakdown, recent activity |
| Logs | `org_audit_logs` | joined to `organization`; no `tenant_id` column of its own |
| Go | `org_billing`, `plan_tier`, `org_features` | plan, Stripe linkage, trial/period, feature overrides |

Tenancy: `organization.tenantId` is the only tenant link on these tables, so
every query filters through it. `org_billing` and `org_audit_logs` are reached
via `organizationId`.

### Phase 6 — Tests

26. Vitest in the site.
27. **Tenancy isolation test** — required by `AGENTS.md`; must prove a
    credential issued for another tenant is rejected on this site's host.
28. Widen `test.yml`: `turbo run test --filter='./packages/*'
    --filter='./apps/*'` currently **excludes `./sites/*`**, so the new tests
    would never run in CI.

### Phase 7 — Docs

29. `docs-internal/architecture/com-site-c.mdx`.
30. Add to `docs-internal/docs.json` → Repository tab.
31. Add a `coverage.json` entry; update the `system-overview` and `multi-site`
    entries, which enumerate site paths.
32. `docs-public/` page + `docs-public/docs.json`.
33. Document the hybrid styling and nav breakpoint in
    `docs-internal/modules/`.
34. `bun run check:doc-coverage`, `bun run docs:internal:validate`.

Keep the site's docs in `docs-public/` / `docs-internal/` only —
`check-doc-paths.ts` whitelists `sites/*/src/app/docs/` as generated, which
will not match `src/routes/`.

### Phase 8 — CI and deploy

35. Promote `node_version` to a per-row matrix field in both deploy workflows;
    `site-c` gets `24`, the rest keep `22`.
36. Matrix row in `deploy-vercel.yml`: `app: site-c`,
    `project_id_var: VERCEL_PROJECT_ID_SITE_C`, `default_project_id: ''`
    (no-ops until the project exists), `project_name: 'com-site-c'`.
37. Matching row in `deploy-vercel-preview.yml` with a **literal**
    `alias_prefix` (the last commit on `main` fixed a bug here).
38. `knip.json` — add a `sites/com.site-c` block with SolidStart entries
    (`entry-client`, `entry-server`, `app.tsx`, `site.config.ts`,
    `src/routes/**`); the current `sites/*` block lists Next-only files.
39. `.fallowrc.json` — same.
40. Regenerate the dead-code baseline **only once clean** — `dead-code.yml`
    gates on no baseline growth, and SolidStart's file-based routing looks like
    mass unused exports to knip/fallow.
41. Vercel project with Root Directory `sites/com.site-c`; env vars
    `DATABASE_URL` (**the same shared value**), `BETTER_AUTH_SECRET`, etc.

### Phase 9 — Template wiring (it is a fixture)

42. `rename-site.ts` — add `com.site-c`; it only knows `a` / `b`.
43. `configure-env.ts`, `finalize.ts` manifest, `SETUP.md`, `AGENTS.md`,
    `CLAUDE.md`, `README.md` — document the third site.
44. `docs-public/customize/project-structure.mdx`, `operate/deploy.mdx`.

## Verification

```bash
bun install
bun run check:catalog-deps
bun run check:site-routes          # green — proves the site-kit opt-out
bun run check:no-middleware         # green despite src/http/tenant-guard.ts
bun run db:seed:sites
bun run lint && bun run format:check
bun run build                      # what typecheck.yml actually runs
bunx turbo run test --filter='./sites/*'
bun run check:doc-coverage
bun run check:dead-code
bun run check:max-lines
```

Manual: run 8803 alongside `site-a` (8801) and `site-b` (8802) and confirm
host-resolved tenants differ. Per `multi-site.mdx`, browsers share cookies
across localhost ports — test side by side via `com-site-c.localhost:8803`.

## Risks

1. **`nitro@3` is still beta.** It is what the ecosystem currently ships for
   SolidStart 2, but pin it exactly and expect churn.
2. **Neon transactions on Vercel.** `@repo/database` uses `neon-http` by
   default; interactive transactions need the WebSocket-backed
   `neon-serverless` pool via `undici`. Works on Vercel's Node runtime but must
   be smoke-tested against a real preview, not assumed.
3. **Node 24 vs the shared matrix.** Covered above; verify the first preview
   actually builds before trusting it.
4. **Dead-code baseline.** Highest-likelihood CI failure on first push; budget
   for baseline regeneration.
5. **`check:banned-deps` only scans `apps/*`**, so this site bypasses it.
   Route PostHog through `@repo/analytics`' neutral entries rather than
   importing `posthog-js` directly, to respect the rule's intent.
