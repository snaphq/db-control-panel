---
name: setup-kit-development
description: Development workflow for this Next.js starter kit. Use when working on the core project (features, fixes, refactors) — covers how to run the dev server without triggering the setup guard, how to test the unified `bun run setup` flow, and how to revert setup mutations so the repo stays in its pre-setup "template" state.
metadata:
  pathPatterns:
    - ".setup/**"
    - ".auth-provider.lock"
---

# Starter-kit development workflow

This repo is a **template kit**, not a deployed app. The default `bun run dev`
intentionally fails — it routes through `.setup/dev-guard.ts` which prints
"Setup required". That gate exists for end-users running the kit; **we are
developing the kit itself**, so we work around it.

## Running the dev server (core development)

Do **not** run `bun run dev`. Use one of these instead:

| Command | What it does |
|---------|--------------|
| `bun run dev:all` | `turbo run dev` across every workspace — preferred for full local dev. |
| `bun run dev:ws` | Identical alias for `dev:all`. |
| `bun run --filter @repo/next-app dev` | Just the Next.js app, skipping other workspaces. |

`bun run dev` only becomes usable after a real `bun run setup`, because
setup's final step rewrites the root `dev` script from the guard to
`turbo run dev --filter=@repo/next-app`. Do not commit that rewrite.

## Editing setup itself

`.setup/setup.ts` is the unified entry point. It runs two phases:

1. **Auth init** — if `.auth-provider.lock` is missing (or `--force`), it
   backs up `packages/auth` + `apps/next-app/src/lib/auth` to `.auth-backup/`,
   copies the chosen provider's templates over the workspaces, edits
   `package.json` dependencies, and runs `bun install`.
2. **Env config** — interactively (or via `--yes` + env-vars) writes
   `.env.local` and, if a fresh setup ran, restores the root `dev` script.

Headless invocation for testing:

```bash
bun run setup --yes --provider=better-auth
bun run setup --help   # all flags + env-var override list
```

The phase split lives in `.setup/setup-env/{cli,auth-phase,env-helpers}.ts`
and `scripts/lib/prompts.ts` (auto-mode wrapper around inquirer; stays in
`scripts/` because it's shared with other tools). The hard 600-line per-file
limit (`scripts/check-max-lines.ts`) is enforced by the pre-commit hook —
split files instead of fighting it.

**`.setup/` is meant to be deleted by the end-user after first run.** Don't
import from `.setup/` outside `.setup/` itself — the folder must remain
self-evicting. Shared helpers (`scripts/lib/`, `scripts/stripe/`,
`scripts/posthog/`) stay in `scripts/`, and `.setup/` reaches into them via
`../scripts/...` imports.

## Reverting a setup run

After `bun run setup` runs, the repo is in a "setup-applied" state: provider
code has been chosen, templates copied in, deps installed, lock file written.
We want it back in its pre-setup "template-ready" state before continuing
feature work or committing.

### Preferred: revert to the prior commit

The safest approach is to **commit your feature work first**, then run setup
as an isolated experiment, then reset back.

```bash
# 1. Confirm your work is committed
git status
git log -1

# 2. (Optional) run setup to test changes to setup itself
bun run setup --yes --provider=better-auth

# 3. Revert to the pre-setup commit
git reset --hard HEAD            # if setup didn't auto-commit
# or, if setup ran commitAndTag():
git reset --hard HEAD~1
git tag -d v0-setup-done         # only if the tag was created

# 4. Remove untracked artifacts setup created
rm -rf .auth-backup .auth-provider.lock
rm -f apps/next-app/src/middleware.ts apps/next-app/src/lib/auth/client.ts

# 5. Sync node_modules back to the restored bun.lock
bun install
```

### Surgical revert (when you have uncommitted work to preserve)

If for some reason setup ran on top of uncommitted work and you can't simply
`git reset --hard`, restore only the paths setup touches:

```bash
git checkout HEAD -- \
  bun.lock \
  package.json \
  apps/next-app/package.json \
  packages/auth \
  apps/next-app/src/lib/auth

rm -f \
  apps/next-app/src/middleware.ts \
  apps/next-app/src/lib/auth/client.ts \
  .auth-provider.lock

rm -rf .auth-backup
bun install
```

After either approach, verify:

```bash
git status                 # should show only your intended changes
grep '"dev":' package.json # must be "bun run .setup/dev-guard.ts"
```

If `package.json`'s `"dev"` is no longer the dev-guard, the revert was
incomplete — `restoreRootDevScript()` ran and you missed that file.

### About `.env.local`

`.env.local` is gitignored. Setup either creates it (fresh install) or
merges into it (update path). Reverting tracked files does **not** touch
`.env.local`, and that's usually fine: existing values are preserved through
the merge and the only addition is harmless (`AUTH_PROVIDER=...`). Delete
it manually if you want a clean slate.

## Files setup touches (revert checklist)

| Path | Kind | Restore via |
|------|------|-------------|
| `bun.lock` | tracked | `git checkout HEAD --` |
| `package.json` (root) | tracked | `git checkout HEAD --` |
| `apps/next-app/package.json` | tracked | `git checkout HEAD --` |
| `packages/auth/**` | tracked | `git checkout HEAD --` |
| `apps/next-app/src/lib/auth/**` | tracked | `git checkout HEAD --` |
| `apps/next-app/src/middleware.ts` | new (template) | `rm` |
| `apps/next-app/src/lib/auth/client.ts` | new (template) | `rm` |
| `.auth-provider.lock` | new | `rm` |
| `.auth-backup/` | new | `rm -rf` |
| `.env.local` | gitignored | leave alone or `rm` manually |

## Quick rules

- **Never commit** `.auth-provider.lock`, `.auth-backup/`, or the rewritten
  root `"dev"` script. Those are end-user artifacts.
- **Always use** `bun run dev:all` (or `dev:ws`) during core development.
- **Treat `bun run setup` as a destructive test command.** Commit first,
  experiment second, reset back third.
- **The auth provider templates** live in `.setup/templates/auth/<provider>/`. Edit
  templates there, not in `packages/auth/src/providers/` (which gets deleted
  by setup for the chosen provider).
- The pre-commit hook enforces `max-lines: 600` per file, biome formatting,
  type-checking of staged TS, banned-deps, no per-minute cron schedules,
  and "no middleware in next-app except templates". Don't bypass with
  `--no-verify`.
