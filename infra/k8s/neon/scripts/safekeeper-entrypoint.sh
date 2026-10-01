#!/bin/sh
# Safekeeper entrypoint. Derives the node identity from the StatefulSet pod
# name and execs the safekeeper.
#
#   pod safekeeper-<n>  ->  --id <n+1>, --availability-zone az-<n+1>
#
# The id is persisted by the safekeeper in its data directory on first start
# and checked on every later start (set_id in safekeeper/src/bin/safekeeper.rs),
# so ids must never move between pods. A StatefulSet ordinal is stable, and the
# +1 keeps ids positive (the storage controller rejects id <= 0).
#
# Inputs (env, from the pod spec)
#   POD_NAME                      downward API, metadata.name
#   POD_NAMESPACE                 downward API, metadata.namespace
#   BROKER_ENDPOINT               e.g. http://storage-broker.neon.svc.cluster.local:50051
#   S3_BUCKET S3_REGION S3_ENDPOINT   from Secret neon-s3 (S3_ENDPOINT may be empty)
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY   read by the S3 client directly
#   JWT_DIR                       directory with public.pem and safekeeper-token (the latter is
#                                 key SAFEKEEPER_JWT_TOKEN of Secret neon-jwt)

set -eu

die() { printf 'safekeeper-entrypoint: ERROR: %s\n' "$*" >&2; exit 1; }

for _name in POD_NAME POD_NAMESPACE BROKER_ENDPOINT S3_BUCKET S3_REGION JWT_DIR; do
    eval "_val=\${$_name:-}"
    [ -n "$_val" ] || die "required environment variable $_name is empty or unset"
done
S3_ENDPOINT="${S3_ENDPOINT:-}"

ORDINAL="${POD_NAME##*-}"
case "$ORDINAL" in
    ''|*[!0-9]*) die "cannot derive an ordinal from POD_NAME='$POD_NAME'" ;;
esac
SK_ID=$((ORDINAL + 1))
AZ="az-$SK_ID"

# The address other nodes use to reach this safekeeper's WAL service. It is
# the per-pod DNS name of the headless Service `safekeeper`, which stays the
# same across pod restarts (unlike the pod IP). The control-plane worker
# registers the same name with the storage controller.
ADVERTISE_PG="$POD_NAME.safekeeper.$POD_NAMESPACE.svc.cluster.local:5454"

# --remote-storage takes an inline TOML table of S3Config keys
# (libs/remote_storage/src/config.rs). Safekeeper offloads WAL segments to
# <prefix_in_bucket>/<tenant>/<timeline>/<segment>.
case "$S3_BUCKET$S3_REGION$S3_ENDPOINT" in
    *"'"*) die "an S3 setting contains a single quote" ;;
esac
REMOTE_STORAGE="{bucket_name = '$S3_BUCKET', bucket_region = '$S3_REGION', prefix_in_bucket = 'safekeeper/'"
if [ -n "$S3_ENDPOINT" ]; then
    REMOTE_STORAGE="$REMOTE_STORAGE, endpoint = '$S3_ENDPOINT'"
fi
REMOTE_STORAGE="$REMOTE_STORAGE}"

[ -r "$JWT_DIR/public.pem" ] || die "$JWT_DIR/public.pem is missing (Secret neon-jwt, key public.pem)"
[ -r "$JWT_DIR/safekeeper-token" ] || die "$JWT_DIR/safekeeper-token is missing (Secret neon-jwt, key SAFEKEEPER_JWT_TOKEN)"

echo "safekeeper-entrypoint: id=$SK_ID az=$AZ advertise=$ADVERTISE_PG"

# Flags (all verified in safekeeper/src/bin/safekeeper.rs, struct Args):
#   -D                           data directory (the PVC)
#   --listen-pg / --listen-http  bind addresses
#   --advertise-pg               address published to peers via the broker
#   --broker-endpoint            storage broker
#   --remote-storage             S3 target for WAL backup (WAL backup is on by
#                                default; there is no flag to turn it on)
#   --enable-offload             move idle timelines' WAL to S3 and evict them
#   --delete-offloaded-wal       free the local copy after offload
#   --pg-auth-public-key-path    JWT validation on the WAL service (5454);
#                                accepts safekeeperdata (pageservers) and
#                                tenant tokens (computes)
#   --http-auth-public-key-path  JWT validation on the management API (7676);
#                                /v1/status and /metrics stay open for probes
#   --auth-token-path            token this safekeeper presents to its peers
#                                (timeline pull); scope safekeeperdata
exec /usr/local/bin/safekeeper \
    -D /data \
    --id "$SK_ID" \
    --availability-zone "$AZ" \
    --listen-pg 0.0.0.0:5454 \
    --listen-http 0.0.0.0:7676 \
    --advertise-pg "$ADVERTISE_PG" \
    --broker-endpoint "$BROKER_ENDPOINT" \
    --remote-storage "$REMOTE_STORAGE" \
    --enable-offload \
    --delete-offloaded-wal \
    --pg-auth-public-key-path "$JWT_DIR/public.pem" \
    --http-auth-public-key-path "$JWT_DIR/public.pem" \
    --auth-token-path "$JWT_DIR/safekeeper-token"
