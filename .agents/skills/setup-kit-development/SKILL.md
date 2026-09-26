---
name: setup-kit-development
description: Workflow for developing this Next.js template itself (not a project made from it). Use when SETUP.md exists and the user is working on the template — features, fixes, refactors, or the setup flow — so you keep the repo in its pre-setup state and test setup without applying it here.
---

# Developing the template

This repo is a template. New projects are created from it by following
`SETUP.md`, whose last step (`finalize.ts`) deletes every setup-only file.
When you work on the template itself, the repo must stay in its pre-setup
state: `SETUP.md` and the `setup*` skills stay, and `finalize.ts` never runs
here.

## Day-to-day development

- `bun run dev` works normally (there is no dev guard).
- Write docs, README, `env.example`, `AGENTS.md`, and `CLAUDE.md` for the
  **finished** project: Better Auth only, no setup steps, no "starter kit"
  wording. Setup knowledge belongs in `SETUP.md` and `setup*` skills only.
- Use the placeholder names that `rename-project.ts` replaces (for example
  `nextjs-starter-kit`, `Nextjs Starter Kit`) when adding branded strings, or
  add a new pair to its replacement table.

## Adding setup-only material

Anything that exists only to set a project up must be one of:

1. inside a `.agents/skills/setup*/` skill (symlinked into `.claude/skills/`),
2. wrapped in `setup:start` / `setup:end` markers (`// setup:start` in code,
   `<!-- setup:start -->` in Markdown) inside a file that otherwise survives,
3. listed under `delete` in `.agents/skills/setup/manifest.json`.

If it should never appear after setup, add a token for it to the manifest's
`residueTokens` so the finalize scan catches leftovers.

## Testing the setup flow

Never run `finalize.ts` in this repo. Test it in a throwaway clone:

```bash
tmp=$(mktemp -d)
git clone --quiet . "$tmp/app" && cd "$tmp/app"
bun install
bun .agents/skills/setup/scripts/rename-project.ts --name "Test App" --slug test-app
bun .agents/skills/setup/scripts/finalize.ts --ci
```

`--ci` skips the `.env.local` check and the commit. The run fails if any
setup leftover, new dead code, doc-coverage gap, lint error, or build error
remains. `.github/workflows/setup-finalize.yml` runs the same check on PRs
and weekly.

If you ran `finalize.ts` here by mistake, restore the tree with
`git reset --hard HEAD`, or `git reset --hard HEAD~1` if it got as far as
committing `chore: complete project setup`.

## Auth provider skills

`setup-auth-*` skills describe migrating the live Better Auth code to another
provider. When you change auth code, update
`.agents/skills/setup/references/auth-migration.md` so the contract stays
accurate.
