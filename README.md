# AlloyDB

<!-- setup:start -->
> **Creating a new project from this template?** Follow [SETUP.md](./SETUP.md).
> For normal development in this repository, use the current code and guidance
> below; setup tooling runs only when explicitly requested.
<!-- setup:end -->

AlloyDB combines a browser console and admin portal with a control plane for
provisioning PostgreSQL and libSQL databases. The repository contains the
Next.js web apps, the Hono control-plane service, shared packages, and the
infrastructure used to build its service images.

## Workspace

| Path | Responsibility |
| --- | --- |
| `apps/backend` | Platform admin portal, admin MCP endpoint, Stripe webhooks, and Inngest handlers |
| `apps/control-plane` | Hono API, Neon compute and libSQL operations, and data API gateway |
| `sites/net.alloydb.console` | AlloyDB console and tenant-facing site |
| `packages/database` | PostgreSQL schema and data access for the web apps |
| `packages/control-plane-contract` | Shared control-plane request and response schemas |
| `packages/site-kit`, `core`, `react-ui` | Shared site routes, server logic, and React UI |
| `infra/` | Container builds and Kubernetes resources for the control plane and data plane |
| `docs-public/`, `docs-internal/` | Public product guides and internal engineering docs |

The web apps use `packages/database`. The control plane has a separate Drizzle
schema and migration history under `apps/control-plane`; its service database
is not the web-app database.

## Local web development

Use Bun `1.3.14` and a PostgreSQL database.

```bash
bun install
cp env.example .env.local
```

Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BACKEND_ADMIN_EMAILS`, and
`BACKEND_SESSION_SECRET` in `.env.local`. Push the web-app schema and seed the
local tenant data:

```bash
bun run db:push
bun run db:seed
bun run db:seed:sites
bun run dev
```

`bun run dev` starts the Next.js apps. Open the admin portal at
`http://localhost:8800` and the AlloyDB console at `http://localhost:8801`.
The Databases tab also needs `ALLOYDB_API_URL` and `ALLOYDB_API_TOKEN` configured
for a reachable control-plane API. The control-plane service is not started by
the web-app dev command; see the [internal control-plane guide](./docs-internal/platform/control-plane.mdx)
and [deployment guide](./docs-internal/operations/deployments.mdx).

## Architecture and deployment

The web apps share tenant, authentication, billing, analytics, and database
packages. The control plane owns its service database and talks to the Neon,
libSQL, Kubernetes, and PostgREST components described in the
[platform architecture](./docs-internal/platform/architecture.mdx).

GitHub Actions deploy the console and admin portal to their Vercel projects.
The image workflow builds the control-plane and data-plane containers from
pinned source revisions. The root `Dockerfile` is for the Next.js apps; the
control-plane image has its own Dockerfile under `infra/images/`.

## Useful commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the console and admin portal locally |
| `bun run build` | Build workspace packages and apps |
| `bun run lint` | Run Biome checks |
| `bun run db:push` | Push the web-app database schema for local development |
| `bun run db:generate` | Generate migrations in workspaces that define the task, including the control plane |
| `bun run db:migrate` | Apply web-app database migrations |
| `bun run docs:public:validate` | Validate public documentation links |
| `bun run docs:internal:validate` | Validate internal documentation links |
| `bun run check:doc-coverage` | Check documented source roots and navigation pages |

## Documentation

- [Public product guides](./docs-public/index.mdx)
- [Internal engineering docs](./docs-internal/index.mdx)
- [Console database management](./docs-internal/platform/console-databases.mdx)
- [Control-plane service](./docs-internal/platform/control-plane.mdx)
- [Operations and migrations](./docs-internal/operations/deployments.mdx)

## License

This software is proprietary. See [LICENSE](./LICENSE) for the license terms.
