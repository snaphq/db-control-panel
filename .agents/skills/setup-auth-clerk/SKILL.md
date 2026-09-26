---
name: setup-auth-clerk
description: Replace the project's Better Auth implementation with Clerk during initial setup. Use only when the user explicitly chooses Clerk while following SETUP.md; the default is to keep Better Auth.
---

# Set up Clerk instead of Better Auth

This is a code migration, not a config switch. Better Auth is wired through
auth, tenancy, organizations, passkeys, 2FA, and MCP OAuth. Confirm the user
really wants Clerk before starting, and commit any other work first.

## 1. Read the contract

Read `.agents/skills/setup/references/auth-migration.md` in full. It lists
every Better Auth dependency in the repo and the verification checklist this
migration must pass. Re-run its `git grep` commands; the tree may have moved.

## 2. Decide with the user

Ask and record the answers before editing:

1. **MCP OAuth.** Clerk can act as an OAuth provider for MCP clients (check
   Clerk's current MCP/OAuth docs). Replace the `oidcProvider`-based
   `/oauth2/*` and `/.well-known/*` routes with Clerk, or keep a separate
   authorization server?
2. **Users and organizations.** Keep the `user`/`organization`/`member` tables
   and sync them from Clerk webhooks (`user.*`, `organization.*`,
   `organizationMembership.*`), or read Clerk directly and drop them? Most app
   tables reference `user.id` and `organization.id`, so syncing is usually
   less work.
3. **Tenancy.** Clerk has no notion of this project's host-based tenants.
   Map each tenant to a Clerk instance, or to Clerk organizations with tenant
   metadata?
4. **Passkeys and 2FA.** Clerk provides both in its hosted UI. Remove the
   custom account cards (`components/account/authentication/*`) in favour of
   Clerk's `<UserProfile />`?

## 3. Environment and dependencies

- Env: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, plus
  `CLERK_WEBHOOK_SIGNING_SECRET` if syncing. Add them to `env.example`,
  `turbo.json` (the `NEXT_PUBLIC_` key), and the setup env scripts. Remove the
  Better Auth keys.
- Deps: add `@clerk/nextjs` to `packages/site-kit` and `packages/auth` (plus
  `@clerk/backend` in `packages/auth` for server-side calls); remove
  `better-auth` and `@better-auth/passkey`. Use the root catalog for versions
  shared across workspaces.

## 4. Implement

1. Rewrite `packages/auth/src` on Clerk: `server.ts` wraps `auth()` /
   `currentUser()` from `@clerk/nextjs/server` and maps to `UnifiedSession`;
   `client.ts` wraps Clerk hooks (`useUser`, `useClerk`,
   `useOrganization`, `useOrganizationList`) behind the existing export names.
   Delete `auth-instance.ts` and `tenant-binding.ts` once nothing imports
   them.
2. Wrap the app in `<ClerkProvider>` via
   `packages/react-ui/src/components/AuthProviderWrapper.tsx`.
3. Replace request gating in `packages/site-kit/src/proxy.ts` (re-exported by
   every `sites/*/src/proxy.ts`) with
   `clerkMiddleware()` exported as `proxy` (Next.js 16 uses `proxy.ts`; the
   pre-commit hook rejects `middleware.ts`).
4. Replace `app/auth/sign-in` and `sign-up` pages with Clerk's `<SignIn />`
   and `<SignUp />`; delete the `/api/auth/*` Better Auth routes in `packages/site-kit`
   (then `bun run sites:sync`) and the
   cookie helpers in `packages/core/src/auth/session-cookie.ts` / `oauth-route-utils.ts`.
5. Implement the MCP OAuth decision from step 2.
6. If syncing, add a webhook route that verifies the signature and upserts
   users, organizations, and memberships with the tenant id.
7. Update schema per step 2 and generate a migration (`bun run db:generate`).

## 5. Docs and cleanup

Rewrite the auth docs listed in the contract for Clerk. Then run the contract's
verification checklist. `bun run check:dead-code` must report no new findings:
delete Better Auth code, don't leave it unused.
