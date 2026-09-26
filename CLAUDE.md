# CLAUDE.md

<!-- setup:start -->
> **This project has not been set up yet — `SETUP.md` exists.** Before any
> other work, ask the user whether to set the project up now; if yes, follow
> `SETUP.md`. If they are developing the template itself, load the
> `setup-kit-development` skill instead and never run the setup finalize
> script in the template repo.
<!-- setup:end -->

Repository guidelines live in `AGENTS.md`; this file adds Claude-specific
notes.

## Running the dev server

- `bun run dev` — `turbo run dev` across every workspace (TUI)
- `bun run --filter @repo/next-app dev` — just the Next.js app (port 8801)

## Repo conventions

- **Pre-commit hooks enforce**: catalog references for shared dependency
  versions, 600-line max per code file (`scripts/check-max-lines.ts`),
  staged-TS type-checking, no new dead code (`bun run check:dead-code`,
  fallow + knip against shrink-only baselines), banned deps, no
  `middleware.ts` (Next.js 16 uses `proxy.ts`), skill symlinks, and biome
  formatting. Don't `--no-verify`.
- **Skills** live in `.agents/skills/<name>/` and are symlinked as
  `.claude/skills/<name>`; `bun run check:skill-links` enforces it.
- **Auth** is Better Auth, wrapped by `@repo/auth` (`packages/auth/src`).

## Documentation policy

- Public, task-oriented documentation belongs in `docs-public/`.
- Private developer, agent, architecture, security, operations, and testing
  documentation belongs in `docs-internal/`.
- Keep `/auth.md` generated from `apps/next-app/src/app/auth.md/route.ts` as
  the machine-readable protocol source of truth.
- Never add a hand-maintained generic `docs/` directory or nested workspace
  docs directory. The existing `apps/next-app/src/app/docs/` route is a
  generated mirror of `docs-public/`. Use `.agents/tasks/` for planning
  artifacts and `.agents/skills/` for executable agent instructions.
- Preview with `bun run docs:public` or `bun run docs:internal`; validate with
  the corresponding `:validate` command and `bun run check:doc-coverage`.
