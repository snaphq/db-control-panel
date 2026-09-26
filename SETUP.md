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

## 3. Choose the auth provider

The project uses **Better Auth** (email/password, organizations, 2FA,
passkeys, social sign-in, and the OAuth server MCP clients use). Recommend
keeping it.

If the user needs a different provider, load the matching skill now and
finish it before continuing — it changes code and schema:

- Clerk → `setup-auth-clerk`
- WorkOS AuthKit (enterprise SSO) → `setup-auth-authkit`
- NextAuth / Auth.js → `setup-auth-next-auth`

The remaining steps assume Better Auth; the provider skill tells you which
env values replace step 4's auth keys.

## 4. Core environment

Ask for `DATABASE_URL` and the local app URL (default
`http://localhost:8801`).

```bash
bun .agents/skills/setup/scripts/configure-env.ts --section Core \
  --set DATABASE_URL='postgresql://…' \
  --set NEXT_PUBLIC_APP_URL=http://localhost:8801 \
  --generate BETTER_AUTH_SECRET
```

`BETTER_AUTH_URL` defaults to the app URL. Optional auth values (ask whether
they want them):

- Google sign-in: `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  (redirect URI `<app-url>/api/auth/callback/google`)
- GitHub sign-in: `NEXT_PUBLIC_GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- Passkeys in production: `PASSKEY_RP_ID` (the sign-in domain)

## 5. Default tenant and admin

Ask for the default tenant's display name, slug, primary domain (the app
URL's host for local work), and support email; and for the first admin's
name, email, and password. Optionally, email domains whose users become site
admins.

```bash
bun .agents/skills/setup/scripts/configure-env.ts --section Tenant \
  --set DEFAULT_TENANT_ID=acme --set DEFAULT_TENANT_SLUG=acme \
  --set DEFAULT_TENANT_NAME="Acme" --set DEFAULT_TENANT_PLATFORM_NAME="Acme CRM" \
  --set DEFAULT_TENANT_DOMAIN=localhost --set DEFAULT_TENANT_SUPPORT_EMAIL=support@acme.com
bun .agents/skills/setup/scripts/configure-env.ts --section Admin \
  --set ADMIN_NAME="…" --set ADMIN_EMAIL=… --set ADMIN_PASSWORD='…' \
  --set ADMIN_EMAIL_DOMAINS=acme.com
```

## 6. Optional services

Ask which of these the user wants now. Anything skipped stays in the code but
inactive until its env values are set later (`env.example` lists them all).

| Service | How |
| --- | --- |
| Stripe billing | `setup-stripe` skill |
| PostHog analytics and email workflows | `setup-posthog` skill |
| Referral program (needs Stripe) | `setup-referral` skill, after step 7 |
| Upstash Redis (rate limiting, cache) | `configure-env.ts --section Upstash --set UPSTASH_REDIS_REST_URL=… --set UPSTASH_REDIS_REST_TOKEN=…` |
| Resend email (password reset, invites) | `configure-env.ts --section Email --set RESEND_API_KEY=… --set RESEND_FROM_EMAIL=… --set RESEND_FROM_NAME=…` |
| Object storage | Vercel Blob: `--set OBJECT_STORAGE_PROVIDER=vercel-blob --set BLOB_READ_WRITE_TOKEN=…`; S3-compatible: `--set OBJECT_STORAGE_PROVIDER=s3` plus `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` |
| Inngest (scheduled jobs) | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`; locally `INNGEST_DEV=1` |

## 7. Check, link, and seed

```bash
bun .agents/skills/setup/scripts/configure-env.ts --check
bun .agents/skills/setup/scripts/link-env.ts
bun run db:push
bun run db:seed
```

If the user chose referrals, run the `setup-referral` skill now.

## 8. Smoke test

```bash
bun run build
```

Then ask the user to run `bun run dev`, open the app URL, and sign in with the
admin account. Don't drive a browser yourself unless the user asks you to.

## 9. Deployment

Deployment runs through the GitHub Actions Vercel workflow
(`.github/workflows/deploy-vercel.yml`) on pushes to the deploy branch — never
deploy by hand. Tell the user to add the same env values (with production
URLs and live keys) in the Vercel project and the repository secrets the
workflow reads.

## 10. Finalize

```bash
bun .agents/skills/setup/scripts/finalize.ts
```

It removes this file, every `setup*` skill, the setup pointer blocks in
`AGENTS.md`, `CLAUDE.md`, and `README.md`, and other template-only files; then
scans for leftovers, runs the dead-code gate and repo checks, and commits
`chore: complete project setup`. If any check fails, fix the cause and
re-run it. Ask the user before pushing.
