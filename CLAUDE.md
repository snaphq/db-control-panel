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
- `bun run dev:backend` — admin portal only (`apps/backend`, port 8800)
- `bun run dev:site-a` / `bun run dev:site-b` — one tenant site
  (`sites/com.site-a` on 8801, `sites/com.site-b` on 8802)

## Apps and sites

- `apps/backend` is the platform admin portal. It has its own sign-in
  (`BACKEND_ADMIN_EMAILS` + emailed code) and hosts Stripe webhooks, Inngest,
  and the admin MCP endpoint (`/mcp?tenant=<id>`).
- `sites/*` are tenant sites. Shared routes live in `packages/site-kit/src/app`;
  each site keeps generated one-line shims (`bun run sites:sync`, checked by
  `bun run check:site-routes` in pre-commit) plus its own `site.config.ts`,
  branding, and landing/legal pages. Edit shared routes in site-kit, never the
  generated shims; a site overrides a route by committing its own file there.
- Shared logic is in `packages/core`, shared React in `packages/react-ui`.

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
- Keep `/auth.md` generated from `packages/site-kit/src/app/auth.md/route.ts` as
  the machine-readable protocol source of truth.
- Never add a hand-maintained generic `docs/` directory or nested workspace
  docs directory. The existing `packages/site-kit/src/app/docs/` route is a
  generated mirror of `docs-public/`. Use `.agents/tasks/` for planning
  artifacts and `.agents/skills/` for executable agent instructions.
- Preview with `bun run docs:public` or `bun run docs:internal`; validate with
  the corresponding `:validate` command and `bun run check:doc-coverage`.
