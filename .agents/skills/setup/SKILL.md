---
name: setup
description: Core initial-setup skill for this project. Use when SETUP.md exists at the repo root (the project has not been set up yet) and you are following it, or when a setup-* skill points here for shared scripts and references.
---

# Project setup

`SETUP.md` at the repo root is the runbook. Follow it step by step. This skill
holds the scripts and references it points to. Ask the user for values;
scripts only write what you pass them.

## Scripts

Run from the repo root.

| Script | Purpose |
| --- | --- |
| `bun .agents/skills/setup/scripts/configure-env.ts --set KEY=VALUE …` | Merge shared values into the root `.env.local`. `--generate KEY` creates a secret if missing; `--from-json file` reads many values; `--check` verifies the required keys. `--site FOLDER` writes a site's non-secret local values to `sites/FOLDER/.env.development` instead; setting its `NEXT_PUBLIC_APP_URL` also fills `BETTER_AUTH_URL` and syncs that site's dev port. |
| `bun .agents/skills/setup/scripts/rename-site.ts --from com.site-a --to com.acme …` | Rename a placeholder site folder and package, and optionally set its name, domain, tenant, and MCP server name. Updates every tracked reference; run `bun install` afterwards. |
| `bun .agents/skills/setup/scripts/link-env.ts` | Symlink `.env.local` into `apps/backend`, every `sites/*` app, and `packages/database`. |
| `bun .agents/skills/setup/scripts/finalize.ts` | Last step. Removes every setup artifact listed in `manifest.json`, strips `setup:start`/`setup:end` marker blocks, scans for leftovers, runs the dead-code gate and repo checks, and commits. `--no-commit` skips the commit; `--ci` also skips the env check. |

## Manifest

`manifest.json` lists what finalize deletes and the tokens that must not
remain afterwards. When you add setup-only material anywhere in the repo,
either put it inside a `setup*` skill, wrap it in `setup:start`/`setup:end`
markers (comments in code, `<!-- -->` in Markdown), or add its path to the
manifest. Never leave setup-only content that finalize doesn't know about.

## References

- `references/auth-migration.md` — every Better Auth dependency in the repo
  and the checklist for replacing it. Used by the `setup-auth-*` skills.
