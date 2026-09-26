# CLAUDE.md

This repo is a **Next.js starter kit / template**, not a deployed app. End users
run `bun run setup` once to pick an auth provider and configure `.env.local`;
we are developing the kit itself, so the workflow is different.

For the full workflow, see
`.agents/skills/setup-kit-development/SKILL.md` — invoked via the
`setup-kit-development` skill.

## Running the dev server

**Do not run `bun run dev`** — it's gated by `.setup/dev-guard.ts` and exits
with "Setup required". Use one of these instead:

- `bun run dev:all` — `turbo run dev` across every workspace (preferred)
- `bun run dev:ws` — identical alias for `dev:all`
- `bun run --filter @repo/next-app dev` — just the Next.js app

`bun run dev` only becomes usable after `bun run setup` rewrites the root
`"dev"` script. **Never commit that rewrite.**

## Testing the setup flow

`bun run setup` is the unified entry point: auth-provider init (if
`.auth-provider.lock` is missing) followed by `.env.local` configuration.
It mutates the repo (replaces `packages/auth/src`, edits `package.json`,
runs `bun install`).

Treat it as a destructive test command:

1. Commit your in-progress feature work first.
2. Run `bun run setup --yes --provider=better-auth` (or interactive).
3. **Revert back to the prior commit** to restore the pre-setup state:
   ```bash
   git reset --hard HEAD              # or HEAD~1 if setup auto-committed
   rm -rf .auth-backup .auth-provider.lock
   rm -f apps/next-app/src/middleware.ts apps/next-app/src/lib/auth/client.ts
   bun install
   ```
4. Verify the dev-guard is back:
   ```bash
   grep '"dev":' package.json   # must be "bun run .setup/dev-guard.ts"
   ```

`.env.local` is gitignored; setup merges into it without losing existing
values. Leave it or delete manually.

## Repo conventions

- **All initial-setup machinery lives in `.setup/`** (setup.ts, dev-guard,
  templates, auth-init ops, setup-stripe/posthog/referral, link-env). It's
  meant to be deleted by the end-user after first run; don't import from
  `.setup/` outside `.setup/` itself.
- **Auth provider templates** live in `.setup/templates/auth/<provider>/`. Edit
  them there — the live `packages/auth/src/providers/` folder gets deleted
  by setup for the chosen provider.
- **Pre-commit hooks enforce**: catalog references for shared dependency
  versions, 600-line max per code file
  (`scripts/check-max-lines.ts`), staged-TS type-checking, banned deps,
  no middleware outside templates, biome formatting. Don't `--no-verify`.
- Never commit `.auth-provider.lock`, `.auth-backup/`, or the rewritten
  root `"dev"` script — those are end-user artifacts.

## Documentation policy

- Public, task-oriented documentation belongs in `docs-public/`.
- Private developer, agent, architecture, security, operations, and testing
  documentation belongs in `docs-internal/`.
- Keep `/auth.md` generated from `apps/next-app/src/app/auth.md/route.ts` as
  the machine-readable protocol source of truth.
- Never add a hand-maintained generic `docs/` directory or nested workspace
  docs directory. The existing `apps/next-app/src/app/docs/` route is a
  generated mirror of `docs-public/`. Use `.agents/tasks/` for planning
  artifacts and `.agents/skills/` or `.claude/skills/` for executable agent
  instructions.
- Preview with `bun run docs:public` or `bun run docs:internal`; validate with
  the corresponding `:validate` command and `bun run check:doc-coverage`.
