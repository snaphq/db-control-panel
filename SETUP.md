# SETUP.md — set up a new project from this template

This file exists only until the project is set up. Its presence means setup
has not been done. The last step deletes it, together with every other
setup-only file, and checks that nothing stale is left.

**For agents:** work through the steps in order. Ask the user for every value;
never invent credentials. Scripts live in `.agents/skills/setup/scripts/` and
are described in `.agents/skills/setup/SKILL.md`. Run commands from the repo
root. Keep secrets out of chat summaries and commit messages.

## 0. Confirm this is a new project

Ask the user: "Do you want to set up a new project from this template now?"

- **Yes** → continue.
- **No, I'm developing the template itself** → stop. Load the
  `setup-kit-development` skill. Never run `finalize.ts` in the template repo.

Make sure the working tree is clean (`git status`) and work on the current
branch.

## 1. Prerequisites

- Bun (version in the root `package.json` → `packageManager`)
- A PostgreSQL database. A free [Neon](https://neon.tech) project works; copy
  its connection string.

```bash
bun install
```

## 2. Name the project

Ask for the product name, a slug (lowercase, dashes), and the production URL
(default `https://<slug>.vercel.app`).

```bash
bun .agents/skills/setup/scripts/rename-project.ts \
  --name "Acme CRM" --slug acme-crm --url https://app.acme.com
```

This replaces the template's placeholder names in page titles, package names,
MCP server names, the Inngest app id, docs titles, and default URLs.

## 3. Name the sites

The project ships one admin portal and two tenant sites:

| Folder | Role | Local URL |
| --- | --- | --- |
| `apps/backend` | Admin portal for every site (platform admins only) | http://localhost:8800 |
| `sites/com.site-a` | First tenant site (placeholder name) | http://localhost:8801 |
| `sites/com.site-b` | Second tenant site (placeholder name) | http://localhost:8802 |

`com.site-a` and `com.site-b` are placeholders. Tell the user they should
rename them as required, and ask, for each site they want to rename: the new
folder name (reverse-domain style, e.g. `com.acme`), display name, production
domain, and tenant id. Keep `sites/com.site-a` on the `default` tenant unless
the user picks another id; that site's tenant must match `DEFAULT_TENANT_ID`
in step 6.

```bash
bun .agents/skills/setup/scripts/rename-site.ts --from com.site-a --to com.acme \
  --name "Acme" --domain app.acme.com --tenant default --mcp-name acme-mcp
bun .agents/skills/setup/scripts/rename-site.ts --from com.site-b --to com.globex \
  --name "Globex" --domain app.globex.com --tenant globex --mcp-name globex-mcp
bun install
```

Every flag except `--from`/`--to` is optional; the user may also keep a
placeholder name for now. Each site's branding, landing pages, and legal pages
live in its own folder; everything else is shared from `packages/site-kit`.

## 4. Choose the auth provider

The project uses **Better Auth** (email/password, organizations, 2FA,
passkeys, social sign-in, and the OAuth server MCP clients use). Recommend
keeping it.

If the user needs a different provider, load the matching skill now and
finish it before continuing — it changes code and schema:

- Clerk → `setup-auth-clerk`
- WorkOS AuthKit (enterprise SSO) → `setup-auth-authkit`
- NextAuth / Auth.js → `setup-auth-next-auth`

The remaining steps assume Better Auth; the provider skill tells you which
env values replace step 5's auth keys.

## 5. Core environment

Ask for `DATABASE_URL` and the emails allowed into the admin portal.

```bash
bun .agents/skills/setup/scripts/configure-env.ts --section Core \
  --set DATABASE_URL='postgresql://…' \
  --set BACKEND_ADMIN_EMAILS=you@acme.com \
  --generate BETTER_AUTH_SECRET --generate BACKEND_SESSION_SECRET
```

Shared values go in the root `.env.local`. Each app's local URL lives in its
committed `.env.development` (backend 8800, sites 8801 and 8802), so never put
`NEXT_PUBLIC_APP_URL` or `BETTER_AUTH_URL` in `.env.local`. To change a site's
local URL (this also updates its dev port):

```bash
bun .agents/skills/setup/scripts/configure-env.ts --site com.site-a \
  --set NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Optional auth values (ask whether they want them):

- Google sign-in: `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  (redirect URI `<site-url>/api/auth/callback/google`, one per site)
- GitHub sign-in: `NEXT_PUBLIC_GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- Passkeys in production: `PASSKEY_RP_ID` (the sign-in domain)

## 6. Default tenant and admin

Each site's tenant comes from its `src/site.config.ts` (step 3). The default
tenant (`sites/com.site-a` unless renamed) can also take a support email and
logo from `DEFAULT_TENANT_*`. Ask for the default tenant's support email, and
for the first site admin's name, email, and password: a `site-admin` user of
the default tenant who can manage every workspace on that site. Platform
administration happens in the admin portal instead (step 5). Optionally, ask
for email domains whose users become site admins.

```bash
bun .agents/skills/setup/scripts/configure-env.ts --section Tenant \
  --set DEFAULT_TENANT_ID=default --set DEFAULT_TENANT_SUPPORT_EMAIL=support@acme.com
bun .agents/skills/setup/scripts/configure-env.ts --section Admin \
  --set ADMIN_NAME="…" --set ADMIN_EMAIL=… --set ADMIN_PASSWORD='…' \
  --set ADMIN_EMAIL_DOMAINS=acme.com
```

## 7. Optional services

Ask which of these the user wants now. Anything skipped stays in the code but
inactive until its env values are set later (`env.example` lists them all).

| Service | How |
| --- | --- |
| Stripe billing | `setup-stripe` skill |
| PostHog analytics and email workflows | `setup-posthog` skill |
| Referral program (needs Stripe) | `setup-referral` skill, after step 8 |
| Upstash Redis (rate limiting, cache) | `configure-env.ts --section Upstash --set UPSTASH_REDIS_REST_URL=… --set UPSTASH_REDIS_REST_TOKEN=…` |
| Resend email (password reset, invites) | `configure-env.ts --section Email --set RESEND_API_KEY=… --set RESEND_FROM_EMAIL=… --set RESEND_FROM_NAME=…` |
| Object storage | Vercel Blob: `--set OBJECT_STORAGE_PROVIDER=vercel-blob --set BLOB_READ_WRITE_TOKEN=…`; S3-compatible: `--set OBJECT_STORAGE_PROVIDER=s3` plus `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` |
| Inngest (scheduled jobs) | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`; locally `INNGEST_DEV=1` |

## 8. Check, link, and seed

```bash
bun .agents/skills/setup/scripts/configure-env.ts --check
bun .agents/skills/setup/scripts/link-env.ts
bun run db:push
bun run db:seed
bun run db:seed:sites
```

`db:seed` creates the default tenant and the site admin; `db:seed:sites` then
creates or updates one tenant (and its primary domain) per site from its
`site.config.ts`.

If the user chose referrals, run the `setup-referral` skill now.

## 9. Smoke test

```bash
bun run build
```

Then ask the user to run `bun run dev` (all apps) or `bun run dev:backend`,
`bun run dev:site-a`, `bun run dev:site-b` one at a time; sign in to the admin
portal at http://localhost:8800 with an email from `BACKEND_ADMIN_EMAILS` (the
code prints to the console until Resend is configured); and sign in to a site
with the admin account from step 6. Don't drive a browser yourself unless the
user asks you to.

## 10. Deployment

Deployment runs through the GitHub Actions Vercel workflow
(`.github/workflows/deploy-vercel.yml`) on pushes to the deploy branch — never
deploy by hand. Each app is its own Vercel project:

| App | Vercel Root Directory | Repository variable with the project id |
| --- | --- | --- |
| `sites/com.site-a` | repository root (uses `vercel.json`) | `VERCEL_PROJECT_ID_SITE_A` |
| `sites/com.site-b` | `sites/com.site-b` | `VERCEL_PROJECT_ID_SITE_B` |
| `apps/backend` | `apps/backend` | `VERCEL_PROJECT_ID_BACKEND` |

Tell the user to create the projects, set `VERCEL_ORG_ID` and the project-id
variables plus the `VERCEL_TOKEN` secret in the repository, and add the env
values (production URLs and live keys) to each project. Apps without a
project id are skipped. Point the Stripe webhook at
`https://<backend-domain>/api/webhooks/stripe` and Inngest at
`https://<backend-domain>/api/inngest`: both run on the backend.

## 11. Finalize

```bash
bun .agents/skills/setup/scripts/finalize.ts
```

It removes this file, every `setup*` skill, the setup pointer blocks in
`AGENTS.md`, `CLAUDE.md`, and `README.md`, and other template-only files; then
scans for leftovers, runs the dead-code gate and repo checks, and commits
`chore: complete project setup`. If any check fails, fix the cause and
re-run it. Ask the user before pushing.
