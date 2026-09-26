# Auth provider migration contract

The project ships with Better Auth only. A `setup-auth-<provider>` skill
replaces it with another provider. This file lists everything in the repo
that depends on Better Auth, so a migration can be planned and checked
against it. Read it fully before starting a migration.

**Re-derive before trusting.** This list was written against the tree at the
time the skill was authored. Confirm each item with `git grep` before editing:

```bash
git grep -n "better-auth\|getBetterAuthServer\|baseServer\|runWithAuthTenantContext" -- apps packages
git grep -n 'from "@repo/auth' -- apps packages | cut -d: -f1 | sort -u
```

## 1. The `@repo/auth` surface the app imports

Keep these export names and shapes so app code keeps compiling. Re-implement
them on top of the new provider; delete an export only after removing every
importer.

**`@repo/auth/server`** (~115 imports)

- `auth.api.getSession({ headers })` → `UnifiedSession | null` (most used)
- `getSession(headers)`
- `getBetterAuthServer()`, `baseServer` (sign-in/up, API handler) — Better
  Auth–named; rename to provider-neutral names and update importers
- `runWithAuthTenantContext`, `currentAuthTenantContext`,
  `withTenantBoundAuthAdapter` — tenant scoping for every auth DB call

**`@repo/auth/client`** (~20 imports)

- `signIn`, `signUp`, `signOut`, `getSession`, `useSession`,
  `refetchSession`, `getBaseClient`, `forgotPassword`
- `organizationMethods`, `useActiveOrganization`, `useListOrganizations`
- `twoFactor`, `passkey`

**`@repo/auth/types`**: `UnifiedUser`, `UnifiedSession`, `Organization`, and
the sign-in/sign-up/reset/organization param and result types.

## 2. Better Auth–specific code outside `packages/auth`

Tenant sites (`sites/*`) share their routes through `packages/site-kit`; the
files under `sites/*/src/app` are generated one-line shims
(`bun run sites:sync`), so edit the implementation in `packages/site-kit`.
`apps/backend` has its own admin sign-in (`apps/backend/src/lib/admin-auth.ts`,
`BACKEND_ADMIN_EMAILS`) and is out of scope, except
`apps/backend/src/app/api/admin/users/route.ts`, which creates tenant users
through `getBetterAuthServer()`.

| Path | Coupling |
| --- | --- |
| `packages/auth/src/auth-instance.ts` | Plugins: `organization` (tenant-bound fields), `twoFactor`, `passkey`, `oidcProvider` (MCP OAuth), Google/GitHub social providers, email+password |
| `packages/auth/src/tenant-binding.ts` | Tenant-bound Drizzle adapter wrapper |
| `packages/site-kit/src/app/api/auth/[...all]` | Better Auth catch-all handler |
| `packages/site-kit/src/app/api/auth/{sign-in,sign-up,sign-out,get-session,forgot-password,reset-password,organization}` | Wrappers over `baseServer` / Better Auth API |
| `packages/site-kit/src/app/auth/**` | Sign-in, sign-up, invitation, onboarding, reset, profile UI |
| `packages/core/src/auth/session-cookie.ts` | Hard-coded `better-auth.session_token` cookie names |
| `packages/core/src/auth/oauth-route-*.ts`, `oauth-token.ts` | Session-cookie detection and OIDC route helpers |
| `packages/site-kit/src/proxy.ts` | Session check via `auth.api.getSession` |
| `packages/core/src/auth/require-membership.ts` | `site-admin` role check for workspace access |
| `packages/site-kit/src/app/oauth2/*`, `.well-known/{oauth-authorization-server,openid-configuration,jwks.json,oauth-protected-resource}` | MCP OAuth/OIDC authorization server built on `oidcProvider` |
| `packages/core/src/agent-auth/**`, `app/auth.md` | Agent registration protocol; uses the OIDC server above |
| `packages/ui/src/components/account/authentication/*` | Passkey, two-factor, sign-in-method cards |
| `packages/site-kit/src/__tests__/agent-readiness-protocol.test.ts` | Imports `better-auth` types |

## 3. Database tables owned by Better Auth

In `packages/database/src/schema.ts` and `schema-ext.ts`: `user`, `session`,
`account`, `verification`, `organization`, `member`, `invitation`,
`two_factor`, `passkey`, `oauth_application`, `oauth_access_token`,
`oauth_consent`. App tables reference `user.id` and `organization.id`.

Decide per table: keep (the new provider syncs users/orgs into it via
webhooks), migrate, or drop. Dropping a table requires a Drizzle migration
(`bun run db:generate`) and removing every reference.

## 4. The hard part: MCP OAuth

MCP clients (Claude, ChatGPT connectors) authenticate through the OAuth 2.1 /
OIDC authorization server that Better Auth's `oidcProvider` plugin provides
(`/oauth2/*`, `/.well-known/*`, dynamic client registration, PKCE S256). The
new provider must either act as that authorization server itself, or you keep
a separate authorization server. Resolve this with the user before editing
code; each provider skill states what the provider offers, but confirm
against the provider's current docs.

## 5. Environment, dependencies, docs

- Remove `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (also in every
  `sites/*/.env.development`), `PASSKEY_RP_ID` (if passkeys go), and add the
  provider's keys in `env.example`, `turbo.json`
  (`globalEnv`/task `env` for `NEXT_PUBLIC_*`), and the setup env scripts.
- `packages/auth/package.json`: remove `better-auth`, `@better-auth/passkey`;
  add the provider SDK. Shared versions go in the root `catalog`
  (`bun run check:catalog-deps`).
- Rewrite `docs-public/configure/authentication.mdx`,
  `docs-internal/architecture/authentication.mdx`,
  `docs-internal/operations/configuration-and-secrets.mdx`, the README auth
  lines, and `AGENTS.md`/`.github/copilot-instructions.md` auth notes.

## 6. Verification checklist

- [ ] `bun run build` and `bun run lint` pass
- [ ] `bun run check:dead-code` passes with no new findings — Better Auth code
      must be deleted, not left unused
- [ ] `git grep -i "better-auth\|better_auth\|betterauth"` returns only
      intentional hits
- [ ] Sign up, sign in, sign out, password reset work
- [ ] Organization create, switch, invite, and member roles work per tenant
- [ ] Site-admin detection (`ADMIN_EMAIL_DOMAINS`) works
- [ ] MCP client can complete OAuth and call a tool
- [ ] Operator tokens and agent-auth flows still authenticate
- [ ] Docs describe only the new provider
