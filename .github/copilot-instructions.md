# Copilot instructions

Read the repository root [`AGENTS.md`](../AGENTS.md) first. It is the source
of truth for repository conventions, commands, code review expectations, and
the optional project setup flow.

## Current workspace

- `apps/backend` is the Next.js platform admin portal.
- `apps/control-plane` is a Hono service with API and worker modes. It owns a
  separate PostgreSQL database and migration history; root `bun run dev` does
  not start it.
- `sites/net.alloydb.console` is the current tenant-facing Next.js console.
- `packages/site-kit` contains shared site routes. Edit these source routes,
  not generated route shims under `sites/*/src/app`.
- `packages/core` and `packages/react-ui` hold shared web-app logic and UI.
- `packages/database` owns the web-app database. The control plane uses
  `packages/control-plane-contract` for its shared API schemas.
- `infra/` contains control-plane and data-plane image builds and Kubernetes
  resources.

The backend and site share the web-app database. The control plane uses its
own database; do not apply one service's schema or migration workflow to the
other.

## Common commands

Run commands from the repository root:

```bash
bun install
bun run dev
bun run dev:backend
bun run dev:alloydb.console
bun run lint
bun run build
bun run check:doc-coverage
bun run docs:public:validate
bun run docs:internal:validate
```

Use `bun run db:push` only for a disposable local web-app database. The root
`db:generate` task runs in each workspace that defines it, including the
control plane; use `bun run --filter @repo/control-plane db:generate` to scope
generation to that service. The root `db:migrate` task applies web-app
migrations. Control-plane migrations live under `apps/control-plane/drizzle/`
and are applied by the service worker at startup.

## Deployment boundaries

`.github/workflows/deploy-vercel.yml` deploys the web apps. The root
`Dockerfile` builds a selected Next.js app. `.github/workflows/images.yml`
builds the control-plane and data-plane images; those services run from the
Kubernetes resources under `infra/k8s/`.
