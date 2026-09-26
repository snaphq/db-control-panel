# Next.js 16 SaaS Monorepo

A full-stack Next.js app with the App Router, TypeScript, Better Auth, PostgreSQL, and the shared `@repo/database` package, organised as a Turborepo monorepo with Bun workspaces.

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.x-blue)](https://www.typescriptlang.org/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4.x-38bdf8)](https://tailwindcss.com/)
[![Turborepo](https://img.shields.io/badge/Turborepo-Monorepo-EF4444)](https://turbo.build/)

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
│   └── next-app/                 # Next.js 16 application
│       ├── src/                  # App source code
│       │   ├── app/              # Next.js App Router
│       │   ├── components/       # React components
│       │   ├── lib/              # Core utilities
│       │   └── ...
│       ├── public/               # Static assets
│       ├── content/              # Blog MDX content
│       └── ...
│
├── docs-public/                  # Public, task-oriented Mintlify docs
├── docs-internal/                # Private developer and agent Mintlify docs
│
├── packages/
│   ├── ai/                       # OpenAI-compatible model helpers
│   ├── analytics/                # PostHog/Vercel analytics
│   ├── auth/                     # Better Auth wrapper (@repo/auth)
│   ├── billing/                  # Stripe and billing domain logic
│   ├── database/                 # Drizzle schemas and DALs
│   ├── durable-exec/             # Inngest and SEO/AIEO jobs
│   ├── mcp-chatgpt/              # MCP context and logging
│   ├── mcp-server/               # MCP tool registration
│   └── object-storage/            # Vercel Blob/S3 providers
│
├── scripts/                      # Ongoing scripts (seed, checks, integrations)
│   ├── seed-admin.ts             # Seed admin user
│   └── ...
│
├── turbo.json                    # Turborepo config
├── package.json                  # Root workspace
├── biome.json                    # Linting/formatting
└── .env.local                    # Environment variables
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
   `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_SECRET`, and
   `BETTER_AUTH_URL`. See [Configure authentication](./docs-public/configure/authentication.mdx).

3. **Push the database schema and seed the admin user**
   ```bash
   bun run db:push
   bun run db:seed
   ```

4. **Start the dev server**
   ```bash
   bun run dev
   ```

   Then open http://localhost:8801.

## Available Scripts

### Root Scripts (run from monorepo root)

| Command | Description |
|---------|-------------|
| `bun run dev` | Start all dev servers with TUI sidebar |
| `bun run build` | Build all packages and apps |
| `bun run start` | Start production server |
| `bun run lint` | Run Biome linter |
| `bun run lint:fix` | Fix lint issues |
| `bun run format` | Format code with Biome |
| `bun run db:generate` | Generate Drizzle migrations |
| `bun run db:migrate` | Apply migrations |
| `bun run db:push` | Push schema to database |
| `bun run db:studio` | Open Drizzle Studio GUI |
| `bun run db:seed` | Seed admin user |
| `bun run docs:public` | Preview public Mintlify documentation |
| `bun run docs:internal` | Preview internal Mintlify documentation |
| `bun run docs:public:validate` | Validate public documentation links |
| `bun run docs:internal:validate` | Validate internal documentation links |
| `bun run check:doc-coverage` | Verify documented source roots and nav pages |
| `bun run check:catalog-deps` | Verify staged manifests use catalog references |
| `bun run check:dead-code` | Check for new dead code with fallow and knip |

### Filtering to specific packages

```bash
# Run dev only for next-app
bun run --filter @repo/next-app dev

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
NEXT_PUBLIC_APP_URL=http://localhost:8801
BETTER_AUTH_SECRET=   # openssl rand -base64 32
BETTER_AUTH_URL=http://localhost:8801
```

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

1. Deploy to Vercel
2. Connect via MCP: `https://your-app.vercel.app/mcp`
3. Test with "Show me the content" in ChatGPT

See [MCP integration](./docs-public/integrate/mcp.mdx) and
[agent authentication](./docs-public/integrate/agent-auth.mdx) for details.

## Deployment

### Vercel

The root [`vercel.json`](vercel.json) configures monorepo deployment (build/install/output). Scheduled jobs (billing, SEO) run via **Inngest** — see `@repo/durable-exec` and `/api/inngest`; do not use Vercel Cron.

```json
{
  "buildCommand": "bun run build --filter=@repo/next-app",
  "installCommand": "bun install",
  "framework": "nextjs",
  "outputDirectory": "apps/next-app/.next"
}
```

### Docker

```bash
docker build -t app .
docker run -p 8801:8801 --env-file .env.local app
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
rm -rf .turbo node_modules apps/*/node_modules packages/*/node_modules
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
