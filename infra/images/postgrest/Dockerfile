# PostgREST (REST Data API) built from the snaphq/postgrest source checkout.
#
# Build context: the root of a postgrest checkout at POSTGREST_REF (infra/images/sources.env).
#   docker build -f infra/images/postgrest/Dockerfile <postgrest-checkout>
#
# PostgREST v16.4 is tested with GHC 9.10.3 (postgrest.cabal `tested-with`) and
# pins dependency versions in cabal.project.freeze. cabal.project enables tests,
# so they are disabled explicitly here.

FROM haskell:9.10.3-slim-bookworm AS build
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libpq-dev libgmp-dev zlib1g-dev pkg-config ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY postgrest.cabal cabal.project cabal.project.freeze ./
RUN cabal update \
    && cabal build --only-dependencies --disable-tests --disable-benchmarks exe:postgrest
COPY . .
RUN cabal build --disable-tests --disable-benchmarks exe:postgrest \
    && install -D "$(cabal list-bin --disable-tests exe:postgrest)" /out/postgrest \
    && strip /out/postgrest

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 libgmp10 zlib1g ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/postgrest /usr/local/bin/postgrest
USER 1000
# Cap the GHC runtime's worker threads; the binary defaults to -N (all cores).
ENV GHCRTS=-N2
# 3000 API, 3001 admin server (/live, /ready) when PGRST_ADMIN_SERVER_PORT=3001.
EXPOSE 3000 3001
ENTRYPOINT ["/usr/local/bin/postgrest"]
