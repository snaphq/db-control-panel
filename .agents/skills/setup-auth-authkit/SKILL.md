---
name: setup-auth-authkit
description: Replace the project's Better Auth implementation with WorkOS AuthKit during initial setup. Use only when the user explicitly chooses AuthKit/WorkOS (for enterprise SSO/SAML) while following SETUP.md; the default is to keep Better Auth.
---

# Set up WorkOS AuthKit instead of Better Auth

This is a code migration, not a config switch. Better Auth is wired through
auth, tenancy, organizations, passkeys, 2FA, and MCP OAuth. Confirm the user
really wants AuthKit before starting, and commit any other work first.

## 1. Read the contract

Read `.agents/skills/setup/references/auth-migration.md` in full. It lists
every Better Auth dependency in the repo and the verification checklist this
migration must pass. Re-run its `git grep` commands; the tree may have moved.

## 2. Decide with the user

Ask and record the answers before editing:

1. **MCP OAuth.** AuthKit can serve as the OAuth 2.1 authorization server for
   MCP clients (check WorkOS's current MCP docs). Replace the
   `oidcProvider`-based `/oauth2/*` and `/.well-known/*` routes with AuthKit,
   or keep a separate authorization server?
2. **Users and organizations.** Keep the `user`/`organization`/`member` tables
   and sync them from WorkOS events or webhooks, or read WorkOS directly and
   drop them? Most app tables reference `user.id` and `organization.id`, so
   syncing is usually less work.
3. **Tenancy.** Map each host-based tenant to a WorkOS environment or to
   WorkOS organizations with tenant metadata?
4. **Enterprise SSO.** Which connections (SAML, OIDC, Google Workspace) does
   the user need at launch? AuthKit handles MFA and passkeys in its hosted UI,
   so the custom account cards can usually go.

## 3. Environment and dependencies

- Env: `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD` (32+
  characters, generate with `openssl rand -base64 32`), and
  `NEXT_PUBLIC_WORKOS_REDIRECT_URI` (`<app-url>/api/auth/callback`). Add them
  to `env.example`, `turbo.json` (the `NEXT_PUBLIC_` key), and the setup env
  scripts. Remove the Better Auth keys.
- Deps: add `@workos-inc/authkit-nextjs` to `apps/next-app` and
  `packages/auth`, and `@workos-inc/node` to `packages/auth`; remove
  `better-auth` and `@better-auth/passkey`. Use the root catalog for versions
  shared across workspaces.

## 4. Implement

1. Rewrite `packages/auth/src` on AuthKit: `server.ts` wraps `withAuth()` /
   `getSignInUrl()` and maps to `UnifiedSession`; `client.ts` wraps
   `useAuth()` behind the existing export names. Organization methods call
   the WorkOS Organizations API server-side. Delete `auth-instance.ts` and
   `tenant-binding.ts` once nothing imports them.
2. Wrap the app in `<AuthKitProvider>` via
   `apps/next-app/src/components/AuthProviderWrapper.tsx`.
3. Replace request gating in `apps/next-app/src/proxy.ts` with
   `authkitMiddleware()` exported as `proxy` (Next.js 16 uses `proxy.ts`; the
   pre-commit hook rejects `middleware.ts`).
4. Add `apps/next-app/src/app/api/auth/callback/route.ts` using
   `handleAuth()`. Point sign-in/sign-up pages at AuthKit's hosted flow;
   delete the other `/api/auth/*` Better Auth routes and the cookie helpers in
   `lib/auth/session-cookie.ts` / `oauth-route-utils.ts`.
5. Implement the MCP OAuth decision from step 2.
6. If syncing, add a webhook or events consumer that upserts users,
   organizations, and memberships with the tenant id.
7. Update schema per step 2 and generate a migration (`bun run db:generate`).

## 5. Docs and cleanup

Rewrite the auth docs listed in the contract for AuthKit. Then run the
contract's verification checklist. `bun run check:dead-code` must report no
new findings: delete Better Auth code, don't leave it unused.
