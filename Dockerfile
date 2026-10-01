# Builds one app from the monorepo. Pick it with build args, e.g.:
#   docker build --build-arg APP_DIR=apps/backend --build-arg APP_PACKAGE=@repo/backend --build-arg PORT=8800 .
#   docker build --build-arg APP_DIR=sites/com.site-b --build-arg APP_PACKAGE=com.site-b --build-arg PORT=8802 .
FROM oven/bun:1 AS base

ARG APP_DIR=sites/net.alloydb.console
ARG APP_PACKAGE=net.alloydb.console
ARG PORT=8801

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile
RUN bun run build --filter=${APP_PACKAGE}

ENV PORT=${PORT}
EXPOSE ${PORT}

WORKDIR /app/${APP_DIR}
CMD ["bun", "run", "start"]
