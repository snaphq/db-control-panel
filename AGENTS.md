# Repository Guidelines

<!-- setup:start -->
> **This project has not been set up yet — `SETUP.md` exists.** Before any
> other work, ask the user whether to set the project up now; if yes, follow
> `SETUP.md`. If they are developing the template itself, load the
> `setup-kit-development` skill instead and never run the setup finalize
> script in the template repo.
<!-- setup:end -->

## Monorepo Structure

This is a Turborepo monorepo using Bun workspaces and a root dependency catalog
with TUI mode enabled.

```
.
├── apps/
│   └── backend/            # Platform admin portal for every site (@repo/backend)
├── sites/                  # One Next.js 16 app per tenant site
│   ├── com.site-a/         # First site: site.config.ts, branding, landing/legal pages
│   └── com.site-b/         # Second site (thin: config + brand + a few pages)
├── packages/
│   ├── site-kit/           # Shared site routes (src/app), proxy, root layout
│   ├── core/               # Shared server logic (auth helpers, agent auth, operators, integrations)
│   ├── ui/                 # Shared React components, hooks, providers, theme.css
│   ├── database/           # Drizzle schema and data access (@repo/database)
│   ├── auth/               # Better Auth wrapper for the sites (@repo/auth)
│   ├── mcp-server/         # MCP tools and per-site toolsets
│   └── …                   # billing, analytics, ai, durable-exec, search, …
├── docs-public/            # Public, task-oriented Mintlify documentation
├── docs-internal/          # Private developer and agent Mintlify documentation
├── scripts/                # Root-level scripts (seed, checks, site route sync)
├── turbo.json              # Turborepo config with TUI mode
└── package.json            # Root workspace config
```

Dependency direction: `sites/*` and `apps/backend` depend on packages;
`site-kit` depends on `ui` and `core`; `ui` depends on `core`; packages never
import from apps or sites. Shared site routes reach site-owned modules only
through the `@site/*` alias (`@site/site.config`, `@site/lib/source`,
`@site/components/Container/PageWrapper`).

## Build, Test, and Development Commands

All commands use bun and are run from the monorepo root:

- `bun install` - Install all dependencies across workspaces
- `bun run dev` - Start all dev servers with the Turbo TUI
- `bun run dev:backend` / `dev:site-a` / `dev:site-b` - Start one app
- `bun run build` - Production build (fails on type or lint errors)
- `bun run start` - Serve the built apps locally
- `bun run sites:sync` - Regenerate site route shims after changing
  `packages/site-kit/src/app`
- `bun run lint` / `bun run lint:fix` - Biome static analysis
- `bun run format` / `bun run format:check` - Biome formatting

### Database Commands

- `bun run db:generate` - Generate Drizzle migrations
- `bun run db:migrate` - Run migrations
- `bun run db:push` - Push schema to database (dev only)
- `bun run db:studio` - Open Drizzle Studio
- `bun run db:seed` - Seed the default tenant and its site admin
- `bun run db:seed:sites` - Create/update one tenant per `sites/*/src/site.config.ts`

### Workspace Filtering

Run commands for specific packages:

```bash
bun run --filter com.site-a dev         # Run dev for one site only
bun run --filter @repo/backend dev      # Run dev for the admin portal only
bun run --filter @repo/database build   # Build database package only
```

## Documentation policy

- Put public, task-oriented guidance in `docs-public/`.
- Put developer, agent, architecture, security, operations, and verification
  guidance in `docs-internal/`.
- Keep `/auth.md` generated from its route as the machine-readable agent
  contract; document its consumer and implementation views separately.
- Do not add hand-maintained `docs/` or nested `*/docs/*` directories. The
  existing `packages/site-kit/src/app/docs/` route is an allowed generated mirror
  of `docs-public/`; staged-path checks also ignore `.agents/**` and
  `.claude/**`, which hold executable agent instructions.
- `README.md`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, and `LICENCE.md` are the
  root markdown policy exemptions.
- Preview with `bun run docs:public` or `bun run docs:internal`; validate with
  the corresponding `:validate` command and `bun run check:doc-coverage`.

## Package Dependencies

### Shared dependency catalog

Shared external dependency versions are defined once in the root
`package.json` under `catalog`. Workspace `dependencies`, `devDependencies`,
and `optionalDependencies` must use `catalog:` for catalog-managed packages;
keep peer ranges package-specific when a library supports multiple hosts. Use
`workspace:*` for local `@repo/*` packages.

After changing a catalog or adding a catalog-managed dependency, run:

```bash
bun install
bun run check:catalog-deps
```

### Importing from @repo/database

The database package exports schema and client:

```typescript
// Import database client
import { db } from "@repo/database";

// Import schema tables
import { user, session, organization } from "@repo/database/schema";
```

Path aliases in each app's `tsconfig.json` (`apps/backend`, `sites/*`):
- `@/*` - Maps to `./src/*` for app-internal imports
- `@repo/<package>` / `@repo/<package>/*` - Map to `packages/<package>/src`
- `@site/*` (sites only) - Maps to the site's own `./src/*`, used by shared
  routes in `@repo/site-kit`

## Coding Style & Naming Conventions

TypeScript is required across the repo. Use two-space indentation, single quotes in TS/TSX, and keep files UTF-8 ASCII-friendly. Components and hooks follow `PascalCase` (`DashboardShell`) and `camelCase` (`useBillingPortal`). API routes use kebab-case folders (e.g., `src/app/api/billing/route.ts`). Favor server components unless client hooks or browser APIs demand `"use client"`. Run `bun run lint` before pushing; Biome (configured in `biome.json`) enforces both lint and format rules.

## Testing Guidelines

Vitest suites live in the packages and in `apps/backend` (`src/**/*.test.ts` or `src/__tests__/`); run them all with `bunx turbo run test --filter='./packages/*' --filter='./apps/*'` (the CI test job). Tests that touch tenancy must prove isolation between sites, for example that a credential from one site's tenant is rejected on another site's host (`packages/core/src/tenant-isolation.test.ts`). Keep test names declarative (`it('renders empty state when no invoices')`), document manual verification steps in each PR, and run `bun run build` before merging.

## Commit & Pull Request Guidelines

Commits use Conventional Commits (`feat(auth): add passkey login`), enforced by the commit-msg hook: one feature or fix per commit, 72-character subject, and optional body for context. PRs should include: concise summary, screenshots for UI changes, database migration notes if `packages/database/` changed, manual test steps, and linked issues. Ensure PRs pass `bun run lint` and any added tests, and note required environment variables when a feature depends on new secrets.

## Security & Configuration Notes

Secrets belong in `.env.local` (at the monorepo root, symlinked into every app) and never in Git; each app's non-secret local URL lives in its committed `.env.development`. Redact example values before attaching logs. Rotating `BETTER_AUTH_SECRET` signs every site user out; rotating `BACKEND_SESSION_SECRET` invalidates pending admin sign-in codes, and removing an email from `BACKEND_ADMIN_EMAILS` revokes that admin immediately. Database migrations should be reviewed because `db:push` can overwrite dev data—prefer `db:migrate` for anything shared. Every site shares one database: scope queries by the request's tenant and never trust a tenant id supplied by the client.

## Adding New Packages

To add a new shared package:

1. Create `packages/your-package/` with `package.json` (name: `@repo/your-package`)
2. Add `tsconfig.json` extending the root config
3. Export from `src/index.ts`
4. Add as dependency in consuming apps: `"@repo/your-package": "workspace:*"`
5. Add path aliases in every consuming app's `tsconfig.json` (`apps/backend`,
   each `sites/*`, and `packages/site-kit` if it imports the package)

## Adding a New Site

1. Copy `sites/com.site-b` to `sites/<folder>`; set the package name, dev port
   (`package.json`), local URL (`.env.development`), and `src/site.config.ts`
   (tenant, domain, public pages, agent markdown, MCP toolsets).
2. Adjust branding in `src/app/globals.css` and the site-owned pages.
3. `bun install && bun run sites:sync`, then `bun run db:seed:sites`.
4. Add a `dev:<name>` root script and a deploy matrix entry in
   `.github/workflows/deploy-vercel*.yml`.
