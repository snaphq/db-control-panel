# Agent-driven setup (SETUP.md + `setup*` skills) plan

**Status:** Implemented (Phases 0–7) on `main`, 2026-09-26
**Date:** 2026-09-26
**Baseline:** local `main` at `d32ebe1`

## Implementation notes and deviations

- **Verified end-to-end:** a throwaway clone ran `rename-project.ts` then
  `finalize.ts --ci` successfully: it removed 44 files, found no setup
  leftovers and no new dead code, and docs coverage, lint and build all
  passed.
- **Optional features stay in the code (no per-feature deletion).** Tracing
  showed that no optional service can be removed by deleting files alone: for
  example, object storage also backs avatar upload in account settings, and
  the old `teardown-object-storage.ts` would have broken the build. Each
  service already has a "not configured" runtime state, so an unconfigured
  service is inactive, not dead. The manifest therefore only has a
  `delete` list of setup-only paths, and the CI job runs one configuration.
- **Added `rename-project.ts`.** Template branding in app code (page titles,
  MCP server names, Inngest id, default URLs) is replaced by the user's
  name/slug/URL. Generic "starter template" wording was rewritten
  permanently. Branding tokens are part of the leftover scan.
- **fallow does not scan hidden directories**, so knip alone covers
  `.agents/skills/*/scripts`. fallow is pinned as a root devDependency.
  knip runs in CI only; it is not in a pre-push hook.
- **Stripe/PostHog/referral wizards stay interactive**. Their skills
  tell the agent to collect keys with `configure-env.ts` and have the user
  run the wizard (`! bun …`); referral settings can also be set in the
  admin UI. `setup-referral` now uses `@repo/database` instead of `pg`.
- `.opencode/skills` was removed; opencode reads `.agents/skills` directly.
  The `v0-setup-done` tag was dropped.

## Objective

Replace the interactive `bun run setup` scripts with a root `SETUP.md` runbook
that any agent can follow, backed by project skills in `.agents/skills/`. After
setup, the repo must contain no setup machinery, no kit-development
instructions, no docs for declined features or non-chosen auth providers, and
no orphaned code.

## Decisions (confirmed 2026-09-26)

1. **Auth:** Better Auth is the only in-tree provider. Other providers are
   offered as opt-in project skills `.agents/skills/setup-auth-<provider>/`
   (`clerk`, `authkit`, `next-auth`) that an agent follows to migrate the live
   Better Auth code. The stale `.setup/templates/auth/*` are deleted.
2. **Execution model:** SETUP.md drives the flow and asks the user; small
   deterministic scripts (shipped inside the setup skills) do file mutations.
3. **Stripe / PostHog / referral setup** move into skills
   (`setup-stripe`, `setup-posthog`, `setup-referral`), each carrying its own
   scripts.
4. **Naming and linking:** every setup-related skill is prefixed `setup`.
   Every skill in `.agents/skills/` is symlinked as
   `.claude/skills/<name> -> ../../.agents/skills/<name>`.

## Why the current setup cannot be kept

Commit `2ef3188` froze `.setup/templates/auth/*`; the live auth code has since
become a hardened Better Auth-only implementation. Running setup today deletes
`packages/auth/src` and `apps/next-app/src/lib/auth`, replaces them with
templates missing exports used by ~12 app files (`runWithAuthTenantContext`,
`organizationMethods`, `refetchSession`, …), overwrites
`packages/auth/package.json` (drops `@better-auth/passkey`, `./config`), and
writes `middleware.ts` beside `proxy.ts`. The build breaks for every provider,
including better-auth.

## Target end state

### Pre-setup (the kit as shipped)

```
SETUP.md                                   # runbook; its existence = "not set up"
AGENTS.md / CLAUDE.md                      # top block: "If SETUP.md exists, follow it first"
.agents/skills/
  setup/                                   # core: env config, manifest, finalize
    SKILL.md
    manifest.json
    scripts/{configure-env,finalize,link-env,verify-clean}.ts
  setup-kit-development/SKILL.md           # was .claude/skills/starter-kit-workflow
  setup-auth-clerk/SKILL.md
  setup-auth-authkit/SKILL.md
  setup-auth-next-auth/SKILL.md
  setup-stripe/{SKILL.md,scripts/…}        # was .setup/setup-stripe.ts + scripts/stripe/*
  setup-posthog/{SKILL.md,scripts/…}       # was .setup/setup-posthog.ts + scripts/posthog/*
  setup-referral/{SKILL.md,scripts/…}      # was .setup/setup-referral.ts
.claude/skills/<every .agents skill>       # symlinks
```

`.setup/` is removed entirely; its contents move into `setup*` skills. The
root `dev` script runs the app directly (no dev-guard, no post-setup rewrite).

### Post-setup cleanup rule

Delete `SETUP.md`, `.agents/skills/setup*`, `.claude/skills/setup*`, the
AGENTS.md/CLAUDE.md pointer block, plus every path the manifest lists for
declined features. Nothing else should need editing — that is the design
constraint every phase below enforces.

## Design principles

- **Author everything for the post-setup state.** Docs, README, env.example,
  AGENTS.md and CLAUDE.md describe the finished Better Auth project. Setup
  knowledge lives only in SETUP.md and `setup*` skills. Cleanup deletes files;
  it never surgically edits prose.
- **Features are self-contained units.** Each optional feature (Stripe,
  object storage, Upstash, Resend, PostHog, referrals) owns code paths, docs
  pages, `docs.json` nav entries, `coverage.json` entries, env keys and
  package.json scripts, all declared in `manifest.json`.
- **Verify, don't trust.** Finalize ends with a residue scan and the repo's
  existing checks. CI proves the kit can be finalized cleanly.

## Manifest shape (`.agents/skills/setup/manifest.json`)

```json
{
  "always": {
    "paths": ["SETUP.md", ".agents/skills/setup*", ".claude/skills/setup*"],
    "markdownBlocks": ["AGENTS.md", "CLAUDE.md"],
    "packageScripts": []
  },
  "features": {
    "object-storage": {
      "paths": ["packages/object-storage", "apps/next-app/src/app/api/storage", "…"],
      "deps": { "apps/next-app": ["@repo/object-storage", "@vercel/blob"] },
      "docs": { "public": [], "internal": ["modules/ai-and-storage"] },
      "coverageIds": [],
      "envKeys": ["BLOB_READ_WRITE_TOKEN"],
      "packageScripts": []
    }
  },
  "residueTokens": [".setup", "bun run setup", "dev-guard", "starter kit",
                    ".auth-provider.lock", "setup:stripe", "setup:posthog",
                    "setup:referral", "starter-kit-workflow"]
}
```

Exact per-feature path lists are filled in during Phase 4 by tracing imports.

## Phases (one commit each; every commit must pass pre-commit hooks)

### Phase 0 — Dead-code tooling (fallow + knip), ratcheted from today

Lands first so every later phase is measured against a baseline and cannot
add dead code. This also becomes permanent project tooling that survives
setup (it is not a `setup*` artifact).

**Current state (verified 2026-09-26):**

- `.github/workflows/fallow.yml` runs `fallow-rs/fallow@v2` on every push/PR
  with `fail-on-issues: 'false'` — advisory only, SARIF upload.
- No fallow config file; `.fallow/cache.bin` (~940 KB) is **committed** and
  not gitignored.
- knip is not installed and has no config.
- `.husky/pre-commit` has no dead-code step.

**Why both tools:** fallow (Rust, fast) is the pre-commit gate and the richer
analyzer (dead code, circular deps, dupes, catalog hygiene). knip is the
second opinion in CI with mature Next.js / Drizzle / Vitest / Turborepo
plugins; disagreements between them surface config gaps (missing entry
points) rather than real issues.

**Config**

- `.fallowrc.json` — author via `fallow init` / `fallow recommend`, then pin:
  workspaces (`apps/*`, `packages/*`), entry points not auto-detected
  (`apps/next-app/source.config.ts`, `scripts/*.ts`, `scripts/*.mjs`,
  `.agents/skills/*/scripts/*.ts`, `packages/database/drizzle.config.ts`,
  Next 16 `proxy.ts`/`instrumentation.ts` if the plugin misses them), and
  ignores for generated output (`apps/next-app/src/.source/**`, `.next/**`,
  `docs-*/**`). Confirm with `fallow list --entry-points` and
  `fallow workspaces`.
- `knip.json` — `workspaces` block per app/package, same entry points,
  plugins enabled: `next`, `drizzle`, `vitest`, `biome`, `husky`,
  `lint-staged`. Seed from the fallow config (`fallow migrate` works
  knip → fallow, so keep them hand-aligned; a comment in each points at the
  other).
- `.gitignore`: add `.fallow/`; `git rm --cached .fallow/cache.bin`.
- Add `knip` to root `devDependencies` (via catalog if the catalog check
  requires it); fallow stays a CLI (`bunx fallow` / the GH action) — decide in
  this phase whether to pin it as a devDependency for reproducibility.

**Baselines (ratchet, shrink-only)**

- `.fallow/` is ignored, so baselines live at repo root:
  `dead-code-baseline.fallow.json` (`fallow dead-code --save-baseline`) and
  `dead-code-baseline.knip.json` (generated by our wrapper from
  `knip --reporter json`, since knip has no native baseline).
- Existing findings are triaged once in this phase: fix the obvious ones,
  baseline the rest. The baseline may only shrink; the wrapper fails if an
  entry is added and prints a hint when entries disappear
  (`--update-baseline` rewrites it).

**Script — `scripts/check-dead-code.ts`**

```
bun run check:dead-code                 # fallow + knip vs baselines (full repo)
bun run check:dead-code --staged        # fallow only, --file <staged files>
bun run check:dead-code --tool=knip     # one tool
bun run check:dead-code --update-baseline
bun run check:dead-code --strict        # ignore baselines (used by finalize)
```

- fallow: `fallow dead-code --baseline dead-code-baseline.fallow.json
  --fail-on-issues` (+ `--file …` for staged, which still builds the full
  graph but only reports on staged files).
- knip: `knip --reporter json --no-exit-code`, normalise to
  `{type, file, symbol}` tuples, diff against the knip baseline, fail on new
  tuples.
- Output: one grouped report (file → issues) with a fix hint per issue type;
  exit non-zero on regressions. Keep under the 600-line limit (split a
  `scripts/lib/dead-code/` helper if needed).

**Pre-commit (`.husky/pre-commit`)**

- Add `bun run check:dead-code --staged` after `check:staged-types`. Budget:
  must stay under ~5 s on this repo; measure in this phase. If fallow's full
  graph build is too slow, fall back to `fallow audit --base HEAD
  --gate new-only`.
- knip is **not** in pre-commit (full-graph, slower); optionally add it to a
  `.husky/pre-push` hook if timing allows — decide after measuring.

**CI — replace `.github/workflows/fallow.yml` with `dead-code.yml`**

- Trigger: `push` to `main` and all `pull_request`s; `concurrency` group like
  `typecheck.yml`; `runs-on: self-hosted`; `oven-sh/setup-bun@v2`, cached
  `bun install --ignore-scripts` (same pattern as `typecheck.yml`).
- Job `fallow`: `bun run check:dead-code --tool=fallow` (blocking), plus a
  PR-scoped `fallow audit --base origin/${{ github.base_ref }}
  --gate new-only --format github-annotations` for inline annotations, and
  keep the SARIF upload (`fallow dead-code --format sarif`) with
  `security-events: write`.
- Job `knip`: `bun run check:dead-code --tool=knip` (blocking).
- Job `baseline-shrink` (PRs only): fail if either baseline file grew
  relative to the base branch.
- Optional non-blocking step: `fallow dupes` and `fallow health` reports
  uploaded as artifacts, to feed future cleanup — not gated.

**Verify:** run both tools locally, confirm entry-point lists are complete
(no false "unused file" hits on Next.js routes, route handlers, MCP tools,
Inngest functions, Drizzle config, seed scripts), commit config + baselines +
script + hook + workflow together.

### Phase 1 — Skill layout and link enforcement

- Move `.claude/skills/starter-kit-workflow` →
  `.agents/skills/setup-kit-development` and symlink it back.
- Add `scripts/check-skill-links.ts`: every `.agents/skills/*` has a matching
  `.claude/skills/*` symlink and `.claude/skills/` contains no real dirs.
  Wire into `.husky/pre-commit` and `package.json`.

### Phase 2 — Drop provider switching from the live tree

- Delete `.setup/templates/auth/`, `.setup/auth-init/`,
  `.setup/setup-env/auth-phase.ts`, provider flags in `setup-env/cli.ts`.
- Remove dead provider surface: `api/debug-env*` routes reading
  `NEXT_PUBLIC_AUTH_PROVIDER`, AuthKit stub `api/auth/callback/route.ts`,
  `turbo.json` Clerk/WorkOS/`NEXT_PUBLIC_AUTH_PROVIDER` env entries,
  `env.example` provider blocks and `AUTH_PROVIDER`, `.gitignore`
  `.auth-provider.lock` / `.auth-backup/`, `biome.json:28`,
  `check-no-middleware.ts:15`, `check-staged-types.ts:9` template exclusions.
- Rewrite for Better Auth only: `docs-public/configure/authentication.mdx`,
  `docs-internal/architecture/auth-and-setup.mdx` (keep security invariants,
  rename page/coverage id if appropriate), `configuration-and-secrets.mdx`,
  `README.md` auth section, `AGENTS.md:126`, `.github/copilot-instructions.md`.
- Update `docs-internal/coverage.json` entries pointing at removed paths.
- Verify: `bun run build`, `lint`, `check:doc-coverage`, docs `:validate`.

### Phase 3 — `setup-auth-*` skills

- One SKILL.md per provider (`clerk`, `authkit`, `next-auth`) written against
  the **current** live tree: files to replace in `packages/auth/src` and
  `apps/next-app/src/lib/auth`, the `/api/auth/*` route surface, cookie-name
  helpers (`session-cookie.ts`, `oauth-route-utils.ts`), `proxy.ts`, schema
  tables that become unused (two_factor, passkey, OIDC tables in
  `schema-ext.ts`), deps, env keys, docs pages to rewrite, and a verification
  checklist (build, sign-in, org switching, agent-auth flows).
- These are guidance skills, not code templates, so they cannot silently rot
  the way `.setup/templates` did. Each lists the exports the app depends on so
  a migration can be checked against them.

### Phase 4 — Core `setup` skill, manifest and finalize

- Move env configuration (`setup.ts`, `setup-env/{env-helpers,
  provider-config,optional-config,types}.ts`, `link-env.ts`) into
  `.agents/skills/setup/scripts/`, converted to non-interactive scripts that
  take flags/JSON (the agent asks the user; scripts only write). Keep files
  under the 600-line limit.
- Replace `teardown-object-storage.ts` with manifest-driven removal.
- `finalize.ts --drop=<features>`: apply manifest for declined features and
  `always`, prune `docs.json` nav + `coverage.json` entries, remove package
  scripts, `bun install`, run `verify-clean.ts`, then commit
  `chore: complete project setup` (no tag unless user wants one). Never
  `--no-verify`; if a hook fails, stop and report.
- `verify-clean.ts`: grep for `residueTokens` + declined feature names across
  the repo (excluding `node_modules`, `.git`), run `check:doc-coverage`,
  `check:doc-paths`, `check:root-md`, docs `:validate`, `lint`, `build`, and
  `check:dead-code` (Phase 0) in two passes: normal (vs baseline — must not
  regress) and a report of baseline entries whose files were deleted, which
  finalize prunes from both baseline files. Unused deps/exports newly exposed
  by dropped features must be fixed, not baselined.
- Keep `.fallowrc.json` / `knip.json` entry globs generic
  (`.agents/skills/*/scripts/*.ts`) so deleting `setup*` skills needs no
  config edit; if either tool reports a stale/unmatched entry pattern after
  finalize, the manifest lists the config key to prune.
- Move `scripts/lib/{fs,env,log,prompts}.ts` into the skill if they have no
  other importers; keep `scripts/lib/colors.ts`.

### Phase 5 — `setup-stripe`, `setup-posthog`, `setup-referral` skills

- Move `.setup/setup-stripe.ts` + `scripts/stripe/*`,
  `.setup/setup-posthog.ts` + `scripts/posthog/*`, `.setup/setup-referral.ts`
  into their skills' `scripts/`.
- Keep recurring operational commands that are not setup
  (`stripe:verify`, `stripe:backfill`, `posthog:test-*`) in `scripts/` and
  root `package.json` only if they don't depend on moved modules; otherwise
  decide per command in this phase. Fix their "run setup:posthog" messages.
- Update `docs-public/configure/referrals.mdx`, `docs-internal/modules/
  analytics.mdx` to reference the finished-state commands, not setup.

### Phase 6 — SETUP.md, pointers and finished-state docs

- Write `SETUP.md`: prerequisites → DB (Neon) → app URL / tenant → Better Auth
  secrets (or hand off to a `setup-auth-*` skill) → optional features (each
  hands off to its skill or is dropped) → admin user → `db:push` / `db:seed`
  → `finalize`. Each step: what to ask, what to run, how to verify.
- Add `SETUP.md` to `scripts/check-root-md.ts` allowlist.
- Add the pointer block to top of `AGENTS.md` and `CLAUDE.md` between
  `<!-- setup:pointer -->` markers (the only marker-based edit finalize does).
- Move `CLAUDE.md` kit-development content (lines 1-63) into
  `setup-kit-development`; CLAUDE.md keeps only finished-state guidance.
- Rewrite for finished state: `docs-public/start/getting-started.mdx`,
  `start/index.mdx`, `operate/run-locally.mdx`, `operate/troubleshoot.mdx`,
  `customize/extend-the-starter.mdx`, `customize/project-structure.mdx`,
  `index.mdx`, `README.md`, `docs-internal/architecture/system-overview.mdx`,
  `modules/ai-and-storage.mdx`, `coverage.mdx`, `scripts/seed-admin.ts:44`.
  Replace "Starter Kit" branding with a neutral project name placeholder that
  SETUP.md asks for.
- Root `dev` → `turbo run dev`; delete `.setup/dev-guard.ts`,
  `restoreRootDevScript`, `setup`/`setup:*`/`env:link` package scripts, and
  finally the `.setup/` directory.

### Phase 7 — CI guard in the kit repo

- New workflow `.github/workflows/setup-finalize.yml` (self-hosted, Bun,
  same caching as `typecheck.yml`), matrix over
  (a) all features kept and (b) all optional features dropped:
  copy repo to a temp dir → `finalize --drop=… --no-commit` →
  `verify-clean` (residue scan, doc checks, `build`, and
  `check:dead-code` for both fallow and knip).
- Trigger on PRs touching `SETUP.md`, `.agents/skills/setup*/**`,
  `docs-*/**`, `package.json`, `apps/**`, `packages/**`; plus a weekly
  `schedule` so drift is caught even without setup-related PRs.
- Prevents the template drift that broke the old setup.

## Open questions

- Tag after finalize (`v0-setup-done`) — keep or drop?
- Pin fallow as a devDependency or keep using the CLI/GH action?
- Add knip to a `pre-push` hook, or CI only? (Decide after timing in
  Phase 0.)
