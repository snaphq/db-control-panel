# `com.site-d` — standalone Astro 7 tenant site with an account dashboard

**Status:** Phases 1–7 complete; deploy row waits on the Vercel project (manual)
**Date:** 2026-09-26
**Baseline:** local `main` at `c082a2b`
**Reference:** `~/PROJECTS/w3mirror/nexvio-web` (read-only reference; never modified)

## Decisions (confirmed with the owner)

- New site **fresh in this repo**: `sites/com.site-d`, tenant `site-d`, dev port
  **8804**, placeholder domain `starter-astro-stack.vercel.app`. The nexvio-web
  repo is a feature reference only (i18n, SEO pages, markdown middleware) — zero
  changes to it.
- Framework: **Astro 7** (`^7.0.7`), `output: "server"`, Vercel adapter only.
- UI: **React 19 + Tailwind 4** from the root catalog (no Tailwind 3, no React 18).
- Astro 7 requires **Node ≥ 22.12** (verified on npm) — deploy matrix stays `22`.
- Dashboard scope: **account dashboard first** — Better Auth + tenant-scoped
  pages over existing platform tables, no new migrations.
- Standalone site: **no `@repo/site-kit` dependency** (that absence is the whole
  `sites:sync` opt-out); `StandaloneSiteConfig` imported type-only through
  tsconfig paths, exactly like `com.site-c`.
- Template-development mode: the repo stays in pre-setup state; `finalize.ts`
  never runs here.

## Phases → commits

| Phase | Commit | Contents |
| --- | --- | --- |
| 1+2 | `feat(sites): scaffold the com.site-d Astro tenant site` | Catalog entries (`astro`, `@astrojs/react`, `@astrojs/vercel` — must land with their consumer or `check:dead-code` flags unused catalog entries) + package.json, astro.config.mjs (Tailwind 4 vite plugin, server-only shim, `loadEnv` → `process.env`, `.localhost` hosts), tsconfig, `site.config.ts`, env.d.ts + App.Locals, marketing shell (index/pricing/privacy/terms/404), one React 19 island, vitest config + first test, `.env.development`, `.gitignore`, `vercel.json`, root `dev:site-d` script |
| 3 | `fix(scripts): exempt Astro site middleware from the middleware check` | `check-no-middleware.ts` allows `sites/*/src/middleware.ts` (Astro hard-requires that filename; the rule exists for Next 16's proxy rename) |
| 4 | `feat(sites): add tenant guard and Better Auth endpoint to com.site-d` | Astro `src/middleware.ts` (resolveTenantFromHost → 404, no fallback, tenant into `locals`), `src/pages/api/auth/[...all].ts` mounting `getBetterAuthServer({ cookieDelivery: "response" })` inside `runWithAuthTenantContext`, session helper, guard/auth tests mocking `@repo/database` and `@repo/auth` (site-c pattern) |
| 5 | `feat(sites): add the account dashboard to com.site-d` | `/dashboard` overview + settings (user, organizations, sessions — all existing tables, tenantId-bound reads), `/dashboard/login` + `/dashboard/register` (island forms → `/api/auth/*`), anonymous redirect, read-model scoping tests |
| 6 | `chore(ci): deploy com.site-d on Vercel` | matrix rows in `deploy-vercel.yml` + `deploy-vercel-preview.yml` (preview row needs `alias_prefix`); Vercel project + `VERCEL_PROJECT_ID_SITE_D` var is a manual ops step, row skips while empty |
| 7 | `docs(architecture): document the com.site-d Astro site` | `docs-internal/architecture/com-site-d.mdx`, `multi-site.mdx` + coverage.json + docs.json nav updates, AGENTS.md structure touch-up if needed |

## Phase 0 — environment (done)

- Repo on `main` at `c082a2b`, clean tree; root `.env.local` present with
  `DATABASE_URL` (symlinked `.vercel/.env.development.local`).

## Verification gate (before closing out)

Verified by running it:

- `bun install` clean; `sites:sync --check` skips site-d; catalog + root
  `dev:site-d` script in place; Astro 7 + `@astrojs/react@6` peer-accept
  React 19 (catalog 19.2.5).
- Site: 14 vitest tests pass (config identity, guard isolation, auth mount
  context, read-model scoping), `tsc --noEmit` clean, biome clean.
- `db:seed:sites` seeded tenant `site-d` (primary domain
  `starter-astro-stack.vercel.app`), idempotent re-run verified.
- Live dev-server flow against the real database: sign-up → session cookie →
  `get-session` resolves; anonymous `/dashboard` → 302 to login; authenticated
  `/dashboard` renders "Welcome back, Test User"; settings 200; unknown Host
  is rejected (Vite host allowlist 403 in dev — fail-closed; the guard's 404
  path is covered by the unit tests and applies in production).
- Monorepo gates: `sites:sync --check`, turbo lint+test 15/15, root
  `bun run build` 5/5, `check:doc-coverage` (38 entries), Mintlify
  broken-links clean.

**Not verified — needs the Vercel project:** the real deploy (rows exist and
skip until `VERCEL_PROJECT_ID_SITE_D` is set) and production Host resolution
through `starter-astro-stack.vercel.app`.

## Risks / watch items

- TypeScript 7 (catalog) vs `astro check` — verify; fall back to build-only
  type discipline if the checker rejects TS 7.
- `server-only` marker breaks Vite dev → empty-module alias (site-c pattern).
- Astro does not populate `process.env` from `.env*` → `loadEnv` copy in
  astro.config (site-c pattern) so `DATABASE_URL`/`SITE_TENANT_ID` reach
  `@repo/database`.
- React 19 peer ranges for `@astrojs/react` — confirm at install.
- Don't reuse the Vercel project name `nexvio-ai` (site-a's row owns it).
