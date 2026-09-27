# Next.js 16 SaaS Monorepo

<!-- setup:start -->
> **New project from this template?** Follow [SETUP.md](./SETUP.md), or ask
> your coding agent to — it removes itself and all setup-only files when done.
<!-- setup:end -->

A full-stack Next.js app with the App Router, TypeScript, Better Auth, PostgreSQL, and the shared `@repo/database` package, organised as a Turborepo monorepo with Bun workspaces.

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.x-blue)](https://www.typescriptlang.org/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4.x-38bdf8)](https://tailwindcss.com/)
[![Turborepo](https://img.shields.io/badge/Turborepo-Monorepo-EF4444)](https://turbo.build/)

## Live Deployments

Production deploys run from `.github/workflows/deploy-vercel.yml` on every push
to `main`. Status as of 2026-09-27:

| App | Folder | Stack | Production URL |
| --- | --- | --- | --- |
| Site A | `sites/com.site-a` | Next.js 16 | https://nextjs-starter-kit-app.vercel.app |
| Site C | `sites/com.site-c` | SolidStart 2 | https://starter-solid-stack.vercel.app |
| Admin portal | `apps/backend` | Next.js 16 | Not deployed yet (no Vercel project id) |
| Site B | `sites/com.site-b` | Next.js 16 | Not deployed yet (no Vercel project id) |
| Site D | `sites/com.site-d` | Astro | Not deployed yet (no Vercel project id) |

An app without a project id in the workflow matrix is skipped. Once its Vercel
project exists, set the id in both deploy workflows (the setup script
`set-vercel-projects.ts` writes them) and push.

## Features

- **Turborepo Monorepo** with Bun workspaces and a shared dependency catalog
  for consistent installs
- **Next.js 16** with App Router for optimal performance
- **Better Auth** with organizations, two-factor auth, passkeys, social sign-in, and an OIDC provider for MCP clients
- **Shared Database Package** with PostgreSQL and Drizzle ORM for type-safe queries
- **Beautiful UI** with Shadcn UI, TailwindCSS, and multiple component libraries
- **Forms** with React Hook Form and Zod validation
- **State Management** using TanStack Query for server state
- **Rate Limiting & Caching** with Redis/Upstash
- **Payment Integration** with Stripe (optional)
- **ChatGPT Apps SDK** with Model Context Protocol (MCP) support for AI integration
- **Docker Support** for container builds
- **TUI Mode** - Interactive terminal UI when running `bun run dev`

## Monorepo Structure

```
.
├── apps/
│   └── backend/                  # Admin portal for every site (port 8800)
│
├── sites/                        # One Next.js 16 app per tenant site
│   ├── com.site-a/               # First site (port 8801): config, brand, pages, blog
│   └── com.site-b/               # Second site (port 8802)
│
├── docs-public/                  # Public, task-oriented Mintlify docs
├── docs-internal/                # Private developer and agent Mintlify docs
│
├── packages/
│   ├── site-kit/                 # Routes, proxy, and layout shared by every site
│   ├── core/                     # Shared server logic
│   ├── ui/                       # Shared React components and theme
│   ├── ai/                       # OpenAI-compatible model helpers
│   ├── analytics/                # PostHog/Vercel analytics
│   ├── auth/                     # Better Auth wrapper (@repo/auth)
│   ├── billing/                  # Stripe and billing domain logic
│   ├── database/                 # Drizzle schemas and DALs
│   ├── durable-exec/             # Inngest and SEO/AIEO jobs
│   ├── mcp-chatgpt/              # MCP context and logging
│   ├── mcp-server/               # MCP tools and per-site toolsets
│   └── object-storage/           # Vercel Blob/S3 providers
│
├── scripts/                      # Ongoing scripts (seed, checks, site route sync)
│
├── turbo.json                    # Turborepo config
├── package.json                  # Root workspace
├── biome.json                    # Linting/formatting
└── .env.local                    # Shared secrets (linked into every app)
```

## Tech Stack

| Category | Technology |
|----------|-----------|
| Monorepo | Turborepo + bun workspaces |
| Framework | Next.js 16 with App Router |
| Language | TypeScript (strict mode) |
| Styling | TailwindCSS |
| UI Components | Shadcn UI, Radix UI, Tremor, Magic UI |
| Authentication | Better Auth |
| Database | PostgreSQL + Drizzle ORM (shared package) |
| Forms | React Hook Form + Zod |
| State Management | TanStack Query (React Query) |
| API Layer | Next.js Route Handlers and server actions |
| Caching | Redis (Upstash) |
| Payments | Stripe (optional) |
| AI Integration | ChatGPT Apps SDK + MCP |

## Getting Started

### Prerequisites

- **Bun** 1.3+
- A PostgreSQL database (for example a free [Neon](https://neon.tech) database)

### Run locally

1. **Install dependencies**
   ```bash
   bun install
   ```

2. **Configure environment**

   Copy `env.example` to `.env.local` at the repo root and fill in at least
   `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BACKEND_ADMIN_EMAILS`, and
   `BACKEND_SESSION_SECRET`. Each app's local URL is already set in its
   committed `.env.development`. See [Configure authentication](./docs-public/configure/authentication.mdx).

3. **Push the database schema and seed the tenants**
   ```bash
   bun run db:push
   bun run db:seed        # default tenant + its site admin
   bun run db:seed:sites  # one tenant per site
   ```

4. **Start the dev server**
   ```bash
   bun run dev
   ```

   Then open the admin portal at http://localhost:8800 and the sites at
   http://localhost:8801 and http://localhost:8802.

## Available Scripts

### Root Scripts (run from monorepo root)

| Command | Description |
|---------|-------------|
| `bun run dev` | Start all dev servers with TUI sidebar |
| `bun run dev:backend` / `dev:site-a` / `dev:site-b` | Start one app |
| `bun run build` | Build all packages and apps |
| `bun run start` | Start production server |
| `bun run lint` | Run Biome linter |
| `bun run lint:fix` | Fix lint issues |
| `bun run format` | Format code with Biome |
| `bun run db:generate` | Generate Drizzle migrations |
| `bun run db:migrate` | Apply migrations |
| `bun run db:push` | Push schema to database |
| `bun run db:studio` | Open Drizzle Studio GUI |
| `bun run db:seed` | Seed the default tenant and its site admin |
| `bun run db:seed:sites` | Create or update one tenant per site |
| `bun run sites:sync` | Regenerate site route shims from `packages/site-kit` |
| `bun run docs:public` | Preview public Mintlify documentation |
| `bun run docs:internal` | Preview internal Mintlify documentation |
| `bun run docs:public:validate` | Validate public documentation links |
| `bun run docs:internal:validate` | Validate internal documentation links |
| `bun run check:doc-coverage` | Verify documented source roots and nav pages |
| `bun run check:catalog-deps` | Verify staged manifests use catalog references |
| `bun run check:dead-code` | Check for new dead code with fallow and knip |

### Filtering to specific packages

```bash
# Run dev for one site only
bun run --filter com.site-a dev

# Run db commands in database package
bun run --filter @repo/database db:push
```

## Database Management

The database is a shared package at `packages/database/`. All apps import from it:

```typescript
import { db } from "@repo/database";
import { user, organization } from "@repo/database/schema";
```

### Development Workflow

```bash
# Push schema changes directly
bun run db:push

# Open visual database explorer
bun run db:studio
```

### Production Workflow

```bash
# Generate migration files
bun run db:generate

# Apply migrations
bun run db:migrate
```

## Environment Variables

`env.example` lists every variable. The required ones are:

```env
DATABASE_URL=postgresql://user:password@host/db
BETTER_AUTH_SECRET=       # openssl rand -base64 32
BACKEND_ADMIN_EMAILS=you@example.com
BACKEND_SESSION_SECRET=   # openssl rand -base64 32
```

`NEXT_PUBLIC_APP_URL` is per app (it is also the auth base URL): set it in
each app's `.env.development` locally and in each Vercel project in production.

## Development Guidelines

### Code Style

- **TypeScript**: Strict mode enabled
- **Linting/Formatting**: Biome (run `bun run lint`)
- **Components**: Server Components by default, `"use client"` when needed
- **Imports**: Use path aliases (`@/*` for app, `@repo/database` for db)

### Database Operations

```typescript
import { db } from "@repo/database";
import { user } from "@repo/database/schema";
import { eq } from "drizzle-orm";

const users = await db().select().from(user).where(eq(user.email, email));
```

### Adding New Packages

```bash
# Create new package
mkdir -p packages/my-package/src
# Add package.json with name: "@repo/my-package"
# Update root package.json workspaces if needed
```

## ChatGPT Apps SDK Integration

This project includes ChatGPT Apps SDK support for running inside ChatGPT.

1. Deploy a site to Vercel
2. Connect via MCP: `https://<site-domain>/mcp` (each site chooses its own
   toolsets in `src/site.config.ts`)
3. Test with "Show me the content" in ChatGPT (site A exposes the content tool)

See [MCP integration](./docs-public/integrate/mcp.mdx) and
[agent authentication](./docs-public/integrate/agent-auth.mdx) for details.

## Deployment

### Vercel

Each app is its own Vercel project, deployed by the GitHub Actions matrix in
`.github/workflows/deploy-vercel.yml`. The root [`vercel.json`](vercel.json)
builds `sites/com.site-a` from the repository root; `apps/backend` and
`sites/com.site-b` carry their own `vercel.json` and use their folder as the
project Root Directory. Stripe webhooks (`/api/webhooks/stripe`) and scheduled
jobs via **Inngest** (`/api/inngest`, see `@repo/durable-exec`) run on the
backend; do not use Vercel Cron.

```json
{
  "buildCommand": "bun run build --filter=com.site-a",
  "installCommand": "bun install",
  "framework": "nextjs",
  "outputDirectory": "sites/com.site-a/.next"
}
```

### Docker

```bash
# Site A (defaults)
docker build -t site-a .
docker run -p 8801:8801 --env-file .env.local site-a

# Any other app
docker build -t backend --build-arg APP_DIR=apps/backend \
  --build-arg APP_PACKAGE=@repo/backend --build-arg PORT=8800 .
```

## Troubleshooting

### Dependency Issues
```bash
bun install
```

### Database Connection
- Ensure PostgreSQL is running
- Check `DATABASE_URL` in `.env.local`

### TypeScript Errors
```bash
bun run lint
bun run build
```

### Cache Issues
```bash
rm -rf .turbo node_modules apps/*/node_modules sites/*/node_modules packages/*/node_modules
bun install
```

## Resources

- **Next.js**: https://nextjs.org/docs
- **Turborepo**: https://turbo.build/repo/docs
- **Drizzle ORM**: https://orm.drizzle.team/docs
- **BetterAuth**: https://www.better-auth.com/docs
- **Shadcn UI**: https://ui.shadcn.com
- **Biome**: https://biomejs.dev

## License

MIT License - see [LICENSE](LICENSE)
