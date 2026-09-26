---
name: setup-auth-next-auth
description: Replace the project's Better Auth implementation with NextAuth (Auth.js v5) during initial setup. Use only when the user explicitly chooses NextAuth/Auth.js while following SETUP.md; the default is to keep Better Auth.
---

# Set up NextAuth (Auth.js v5) instead of Better Auth

This is a code migration, not a config switch, and it removes features:
Auth.js has no built-in organizations, two-factor auth, or OAuth
authorization server. Make sure the user understands that before starting,
and commit any other work first.

## 1. Read the contract

Read `.agents/skills/setup/references/auth-migration.md` in full. It lists
every Better Auth dependency in the repo and the verification checklist this
migration must pass. Re-run its `git grep` commands; the tree may have moved.

## 2. Decide with the user

Ask and record the answers before editing:

1. **MCP OAuth.** Auth.js is an OAuth *client*, not an authorization server.
   MCP clients need one. Options: keep Better Auth's `oidcProvider` running
   only for `/oauth2/*` (two auth systems — usually a bad trade), use an
   external authorization server, or drop MCP OAuth. This decision often
   means the user should stay on Better Auth; say so.
2. **Organizations.** Auth.js has none. Keep the `organization`, `member`,
   and `invitation` tables and move the organization logic into app code
   (`lib/auth/organizations.ts`, `require-membership.ts`), or drop
   multi-organization support?
3. **Two-factor and passkeys.** Auth.js has experimental WebAuthn support and
   no 2FA. Drop both, or implement them in app code?
4. **Sign-in methods.** Credentials (email + password with `bcryptjs`), OAuth
   providers (Google, GitHub), email magic links?

## 3. Environment and dependencies

- Env: `AUTH_SECRET` (Auth.js v5 name; generate with
  `openssl rand -base64 32`), `AUTH_URL` when not inferable, and
  `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET`
  for OAuth. Add them to `env.example` and the setup env scripts. Remove the
  Better Auth keys.
- Deps: add `next-auth@5` and `@auth/drizzle-adapter` to `packages/auth`;
  keep `bcryptjs` for credentials. Remove `better-auth` and
  `@better-auth/passkey`. Use the root catalog for versions shared across
  workspaces.

## 4. Implement

1. Create the Auth.js config in `packages/auth/src` (`NextAuth({ adapter:
   DrizzleAdapter(db, {...tables}), providers, callbacks })`). Add tenant
   scoping in the `signIn`/`session` callbacks and keep a tenant-bound adapter
   wrapper equivalent to `tenant-binding.ts`.
2. Re-implement the `@repo/auth/server` and `@repo/auth/client` exports on
   `auth()`, `signIn()`, `signOut()`, and `useSession()` from `next-auth`.
   Organization methods become app-level queries per step 2.
3. Replace `/api/auth/[...all]` with the Auth.js handlers
   (`export const { GET, POST } = handlers`); delete the other `/api/auth/*`
   Better Auth routes and the cookie helpers in `lib/auth/session-cookie.ts` /
   `oauth-route-utils.ts`.
4. Update `sites/com.site-a/src/proxy.ts` to use `auth()` from the Auth.js config
   and export it as `proxy` (the pre-commit hook rejects `middleware.ts`).
5. Adapt the Drizzle schema to the adapter's `users`/`accounts`/`sessions`/
   `verificationTokens` shape and generate a migration
   (`bun run db:generate`). Drop `two_factor`, `passkey`, and the
   `oauth_*` tables if those features go.
6. Remove or re-implement the account security cards and MCP OAuth per
   step 2.

## 5. Docs and cleanup

Rewrite the auth docs listed in the contract for Auth.js, and remove docs for
features that were dropped. Then run the contract's verification checklist.
`bun run check:dead-code` must report no new findings: delete Better Auth
code, don't leave it unused.
