# Copilot Instructions

## Project Overview

This is a Turborepo monorepo with a production-ready Next.js 16 application and shared packages. The project uses bun workspaces with TUI mode enabled.

## Tech Stack

- **Package Manager**: Bun (v1.3.14+) with Turborepo and a root dependency catalog
- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript with strict mode enabled
- **Styling**: TailwindCSS with Shadcn UI components
- **Authentication**: Better Auth (`@repo/auth`)
- **Database**: PostgreSQL with Drizzle ORM (@repo/database package)
- **Forms**: React Hook Form with Zod validation
- **State Management**: TanStack Query (React Query)
- **Caching**: Redis via Upstash
- **Payments**: Stripe integration (optional)
- **UI Components**: Shadcn UI, Radix UI, Tremor, Magic UI
- **Icons**: Lucide React, Tabler Icons, React Icons

## Monorepo Structure

```
.
├── apps/
│   └── next-app/           # Next.js 16 application (@repo/next-app)
│       ├── src/
│       │   ├── app/        # App Router pages and layouts
│       │   ├── components/ # Shared UI components
│       │   ├── lib/        # Helpers and business logic
│       │   ├── types/      # TypeScript type definitions
│       │   └── utils/      # Utility functions
│       ├── public/         # Static assets
│       ├── content/        # MDX content
│       └── docs/           # Documentation
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

## Coding Standards

### TypeScript

- **Strict Mode**: Always enabled. All code must be fully typed.
- **No `any` types**: Use proper TypeScript types or `unknown` with type guards.
- **Path Aliases**: Use `@/` for imports within apps/next-app.
- **Package Imports**: Use `@repo/database` for database imports.
- **Type Inference**: Prefer type inference where possible, but add explicit types for function parameters and return values.

### React and Next.js

- **Server Components**: Use Server Components by default. Add `"use client"` directive only when needed (hooks, event handlers, browser APIs).
- **Async Components**: Server Components can be async - use this for data fetching.
- **File Naming**: 
  - Pages: `page.tsx`
  - Layouts: `layout.tsx`
  - Components: PascalCase (e.g., `UserProfile.tsx`)
  - Utilities: camelCase (e.g., `formatDate.ts`)
- **Export Pattern**: Use default exports for pages and layouts, named exports for components and utilities.

### Database Operations

- **ORM**: Use Drizzle ORM for all database operations.
- **Package**: Database is in `packages/database/` and exported as `@repo/database`.
- **Connection**: Import `db` from `@repo/database` and call `db()` to get the database instance.
- **Schema**: Import schema from `@repo/database/schema`.
- **Type Safety**: Leverage Drizzle's TypeScript types for queries.
- **Example**:
  ```typescript
  import { db } from "@repo/database";
  import { user } from "@repo/database/schema";
  import { eq } from "drizzle-orm";
  
  const users = await db().select().from(user).where(eq(user.email, email));
  ```

### Forms and Validation

- **Form Library**: Use React Hook Form for all forms.
- **Validation**: Use Zod schemas for validation.
- **Pattern**:
  ```typescript
  import { useForm } from "react-hook-form";
  import { zodResolver } from "@hookform/resolvers/zod";
  import { z } from "zod";
  
  const schema = z.object({
    email: z.string().email(),
    name: z.string().min(2),
  });
  
  const form = useForm({
    resolver: zodResolver(schema),
  });
  ```

### State Management

- **Server State**: Use TanStack Query for API/database data.
- **Client State**: Use React hooks (useState, useReducer) for local state.
- **Avoid Global State**: Prefer composition and prop drilling for simple cases.

### Styling

- **TailwindCSS**: Use Tailwind utility classes for styling.
- **Component Library**: Use Shadcn UI components when available.
- **Custom Styles**: Avoid custom CSS files; use Tailwind classes or CSS-in-JS if absolutely necessary.
- **Responsive Design**: Always consider mobile-first design with Tailwind responsive prefixes.

### Authentication

- **Better Auth**: The auth instance lives in `packages/auth/src/auth-instance.ts`; app helpers are in `apps/next-app/src/lib/auth/`.
- **Proxy**: Request gating is in `apps/next-app/src/proxy.ts` (Next.js 16 has no `middleware.ts`).
- **Protected Routes**: Use the unified auth API for route protection.
- **User Data**: Access user data via the auth client hooks.

## Development Workflow

### Environment Setup

1. Copy `env.example` to `.env.local` at the monorepo root
2. Fill in required environment variables (auth secrets, database URL)
3. Run `bun install` to install dependencies across all workspaces

### Starting the Development Server

**Before running the dev server, you MUST follow this sequence:**

1. **Check the database**: `DATABASE_URL` in `.env.local` must point to a
   reachable PostgreSQL database (for example Neon).

2. **Sync the database schema**:
   ```bash
   bun run db:push
   ```

3. **Start the development server** (with Turbo TUI):
   ```bash
   bun run dev
   ```

### Database Management

- **Push Schema**: `bun run db:push` - Push schema changes to database (development)
- **Generate Migrations**: `bun run db:generate` - Generate migration files
- **Run Migrations**: `bun run db:migrate` - Apply migrations (production)
- **Database Studio**: `bun run db:studio` - Open Drizzle Studio GUI
- **Seed Admin**: `bun run db:seed` - Seed admin user

### Running the Application

- **Development**: `bun run dev` - Start dev server with Turbo TUI
- **Build**: `bun run build` - Create production build
- **Start**: `bun run start` - Run production build
- **Lint**: `bun run lint` / `bun run lint:fix` - Biome linting
- **Format**: `bun run format` / `bun run format:check` - Biome formatting

### Workspace Filtering

Run commands for specific packages:

```bash
bun run --filter @repo/next-app dev     # Run dev for Next.js app only
bun run --filter @repo/database build   # Build database package only
```

### Docker

- **Build**: `docker build -t app .`
- **Run**: `docker run -p 8801:8801 --env-file .env.local app`

## Best Practices for Issues and PRs

### When Creating Issues

- **Clear Problem Statement**: Describe what needs to be fixed or built.
- **Acceptance Criteria**: List specific requirements for completion.
- **File Context**: Mention which files or areas of code are affected (include app/package name).
- **Breaking Changes**: Note if this changes existing behavior.

### When Implementing Changes

- **Minimal Changes**: Make the smallest changes necessary to solve the problem.
- **Test Before Committing**: Run `bun run lint` and `bun run build` to catch errors.
- **Database Changes**: If schema changes are needed:
  1. Update `packages/database/src/schema.ts`
  2. Run `bun run db:push` (dev) or `bun run db:generate` (prod)
  3. Update affected queries and types
- **Component Changes**: Keep components focused and single-purpose.
- **Type Safety**: Ensure all TypeScript types are correct; no type errors allowed.

### Common Patterns

#### Creating a New Page

```typescript
// apps/next-app/src/app/my-page/page.tsx
export default async function MyPage() {
  // Server-side data fetching
  const data = await fetchData();
  
  return (
    <div>
      <h1>{data.title}</h1>
    </div>
  );
}
```

#### Creating a Client Component

```typescript
// apps/next-app/src/components/MyComponent.tsx
"use client";

import { useState } from "react";

export function MyComponent() {
  const [state, setState] = useState(false);
  
  return (
    <button onClick={() => setState(!state)}>
      {state ? "On" : "Off"}
    </button>
  );
}
```

#### Database Query in API Route

```typescript
// apps/next-app/src/app/api/users/route.ts
import { db } from "@repo/database";
import { user } from "@repo/database/schema";
import { NextResponse } from "next/server";

export async function GET() {
  const users = await db().select().from(user);
  return NextResponse.json(users);
}
```

## Security Considerations

- **Environment Variables**: Never commit `.env.local` or expose secrets.
- **API Routes**: Always validate input and check authentication.
- **Database Queries**: Use parameterized queries (Drizzle handles this).
- **Auth Secrets**: Keep `BETTER_AUTH_SECRET` and OAuth client secrets out of Git and client code.
- **Rate Limiting**: Use Upstash rate limiting for public endpoints.

## Testing Guidelines

- **Build Test**: Always run `bun run build` before submitting changes.
- **Lint Check**: Run `bun run lint` to catch style issues.
- **Manual Testing**: Test the UI in the browser for visual changes.
- **Database Testing**: Test with actual PostgreSQL database, not mocks.

## Common Pitfalls to Avoid

1. **Using Client Components Unnecessarily**: Default to Server Components; only add `"use client"` when required.
2. **Mixing ORM Libraries**: This project uses Drizzle, not Prisma or Supabase.
3. **Ignoring TypeScript Errors**: All TS errors must be resolved; no `@ts-ignore` comments.
4. **Wrong Import Paths**: Use `@repo/database` for database, `@/` for app-internal imports.
5. **Breaking Docker Setup**: Ensure changes work with both local and Docker development.
6. **Modifying node_modules**: Never edit files in `node_modules`; use proper configuration files.

## Adding New Packages

To add a new shared package:

1. Create `packages/your-package/` with `package.json` (name: `@repo/your-package`)
2. Add `tsconfig.json` extending the root config
3. Export from `src/index.ts`
4. Add as dependency in consuming apps: `"@repo/your-package": "workspace:*"`
5. Add path alias in consuming app's `tsconfig.json` if needed for IDE support

## Getting Help

- **Next.js Docs**: https://nextjs.org/docs
- **Drizzle Docs**: https://orm.drizzle.team/docs
- **BetterAuth Docs**: https://www.better-auth.com/docs
- **Turborepo Docs**: https://turbo.build/repo/docs
- **Shadcn UI**: https://ui.shadcn.com
- **TailwindCSS**: https://tailwindcss.com/docs

## Summary

This is a production-ready Turborepo monorepo with a Next.js 16 application and shared packages. Use `@repo/database` for all database imports and follow bun + Turbo patterns for development commands.
