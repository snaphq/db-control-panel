# libSQL server (sqld) built from the snaphq/libsql source checkout.
#
# Build context: the root of a libsql checkout at LIBSQL_REF (infra/images/sources.env).
#   docker build -f infra/images/libsql-server/Dockerfile <libsql-checkout>
#
# Differs from upstream's Dockerfile on purpose: bookworm instead of bullseye,
# a toolchain image matching libsql's rust-toolchain.toml (1.85.0), --locked
# builds, and no gosu wrapper (Kubernetes sets volume ownership via fsGroup).

FROM rust:1.85.0-slim-bookworm AS build
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libclang-dev clang build-essential tcl protobuf-compiler file \
        libssl-dev pkg-config git cmake ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY . .
RUN cargo build --locked --release -p libsql-server -p bottomless-cli \
    && install -D target/release/sqld /out/sqld \
    && install -D target/release/bottomless-cli /out/bottomless-cli

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 666 sqld \
    && useradd --system --uid 666 --gid 666 --home /var/lib/sqld sqld \
    && mkdir -p /var/lib/sqld \
    && chown sqld:sqld /var/lib/sqld
COPY --from=build /out/sqld /out/bottomless-cli /usr/local/bin/
USER sqld
WORKDIR /var/lib/sqld
VOLUME /var/lib/sqld
# 8080 user HTTP (Hrana), 5001 gRPC replication, 8081 admin API (set with --admin-listen-addr).
EXPOSE 8080 5001 8081
ENTRYPOINT ["/usr/local/bin/sqld"]
