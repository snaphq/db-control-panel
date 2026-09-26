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
│   └── next-app/           # Next.js 16 application
│       ├── src/
│       │   ├── app/        # App Router pages and layouts
│       │   ├── components/ # Shared UI components
│       │   ├── lib/        # Helpers and business logic
│       │   ├── types/      # TypeScript type definitions
│       │   └── utils/      # Utility functions
│       ├── public/         # Static assets
│       ├── content/        # MDX content
│       └── ...
├── docs-public/            # Public, task-oriented Mintlify documentation
├── docs-internal/          # Private developer and agent Mintlify documentation
├── packages/
│   └── database/           # Shared Drizzle database package (@repo/database)
│       ├── src/
│       │   ├── schema.ts   # Drizzle schema definitions
│       │   ├── client.ts   # Database connection (getDb)
│       │   └── index.ts    # Re-exports
│       └── drizzle.config.ts
├── scripts/                # Root-level scripts (seed, checks, stripe)
├── turbo.json              # Turborepo config with TUI mode
└── package.json            # Root workspace config
```

## Build, Test, and Development Commands

All commands use bun and are run from the monorepo root:

- `bun install` - Install all dependencies across workspaces
- `bun run dev` - Start all dev servers with the Turbo TUI
- `bun run build` - Production build (fails on type or lint errors)
- `bun run start` - Serve the built app locally
- `bun run lint` / `bun run lint:fix` - Biome static analysis
- `bun run format` / `bun run format:check` - Biome formatting

### Database Commands

- `bun run db:generate` - Generate Drizzle migrations
- `bun run db:migrate` - Run migrations
- `bun run db:push` - Push schema to database (dev only)
- `bun run db:studio` - Open Drizzle Studio
- `bun run db:seed` - Seed admin user

### Workspace Filtering

Run commands for specific packages:

```bash
bun run --filter com.site-a dev     # Run dev for Next.js app only
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

Path aliases in `sites/com.site-a/tsconfig.json`:
- `@/*` - Maps to `./src/*` for app-internal imports
- `@repo/database` - Maps to the database package

## Coding Style & Naming Conventions

TypeScript is required across the repo. Use two-space indentation, single quotes in TS/TSX, and keep files UTF-8 ASCII-friendly. Components and hooks follow `PascalCase` (`DashboardShell`) and `camelCase` (`useBillingPortal`). API routes use kebab-case folders (e.g., `src/app/api/billing/route.ts`). Favor server components unless client hooks or browser APIs demand `"use client"`. Run `bun run lint` before pushing; Biome (configured in `biome.json`) enforces both lint and format rules.

## Testing Guidelines

There is no formal automated test harness yet—document manual verification steps in each PR. When adding tests, colocate them with their modules (`feature.test.tsx`) or under `sites/com.site-a/src/tests`. Prefer Vitest + Testing Library for unit coverage and Playwright for flow tests so they can run inside CI without extra services. Keep test names declarative (`it('renders empty state when no invoices')`). Always run `bun run build` to ensure the app compiles before merging.

## Commit & Pull Request Guidelines

Commits use Conventional Commits (`feat(auth): add passkey login`), enforced by the commit-msg hook: one feature or fix per commit, 72-character subject, and optional body for context. PRs should include: concise summary, screenshots for UI changes, database migration notes if `packages/database/` changed, manual test steps, and linked issues. Ensure PRs pass `bun run lint` and any added tests, and note required environment variables when a feature depends on new secrets.

## Security & Configuration Notes

Secrets belong in `.env.local` (at the monorepo root) and never in Git; redact example values before attaching logs. Rotating `BETTER_AUTH_SECRET` signs every user out. Database migrations should be reviewed because `db:push` can overwrite dev data—prefer `db:migrate` for anything shared. When exposing MCP or webhook endpoints, confirm URLs through `baseUrl.js` to avoid leaking staging hosts.

## Adding New Packages

To add a new shared package:

1. Create `packages/your-package/` with `package.json` (name: `@repo/your-package`)
2. Add `tsconfig.json` extending the root config
3. Export from `src/index.ts`
4. Add as dependency in consuming apps: `"@repo/your-package": "workspace:*"`
5. Add path alias in consuming app's `tsconfig.json` if needed for IDE support
