# AlloyDB control plane (apps/control-plane): one image, four modes selected by
# ALLOYDB_MODE (api, neon-glue, worker, data-api-gateway).
#
# Build context is the repository root, because bun resolves the whole
# workspace against bun.lock:
#   docker build -f infra/images/control-plane/Dockerfile .
#
# Bun is used only to install and run scripts; the service runs on Node 22.
ARG NODE_VERSION=22
ARG BUN_VERSION=1.3.14

FROM oven/bun:${BUN_VERSION} AS bun

FROM node:${NODE_VERSION}-bookworm-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /repo
COPY . .

# Install only what @repo/control-plane needs. --ignore-scripts skips the root
# `prepare` (husky), which does not exist in a production install.
RUN bun install --frozen-lockfile --ignore-scripts --filter @repo/control-plane
RUN bun run --filter @repo/control-plane build

# Prune to production dependencies: drop every node_modules and reinstall
# without devDependencies, with the same lockfile.
RUN find . -maxdepth 3 -name node_modules -prune -exec rm -rf {} + \
 && bun install --frozen-lockfile --production --ignore-scripts --filter @repo/control-plane \
 && mkdir -p apps/control-plane/node_modules

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production
# The layout matches the repository so bun's workspace symlinks stay valid.
WORKDIR /app
COPY --from=build --chown=root:root /repo/node_modules ./node_modules
WORKDIR /app/apps/control-plane
COPY --from=build --chown=root:root /repo/apps/control-plane/package.json ./package.json
COPY --from=build --chown=root:root /repo/apps/control-plane/node_modules ./node_modules
COPY --from=build --chown=root:root /repo/apps/control-plane/drizzle ./drizzle
COPY --from=build --chown=root:root /repo/apps/control-plane/dist ./dist

# uid/gid 1000 is the image's built-in `node` user; Kubernetes pins it numerically.
USER 1000:1000
EXPOSE 8080
ENTRYPOINT ["node", "dist/index.js"]
