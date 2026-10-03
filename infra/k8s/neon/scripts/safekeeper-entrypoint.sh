#!/bin/sh
# Safekeeper entrypoint. Takes the node identity from the environment the
# control-plane worker puts on the pod and execs the safekeeper.
#
#   SAFEKEEPER_ID=<n>  ->  --id <n>, --availability-zone $SAFEKEEPER_AZ (az-<n>)
#
# The id is persisted by the safekeeper in its data directory on first start
# and checked on every later start (set_id in safekeeper/src/bin/safekeeper.rs),
# so a volume must always be started with the same id. The worker gives each
# safekeeper its own StatefulSet `safekeeper-<id>` and never reuses an id, and
# ids are positive (the storage controller rejects id <= 0).
#
# Inputs (env, from the pod spec)
#   SAFEKEEPER_ID                 positive integer, the storage controller node id
#   SAFEKEEPER_AZ                 logical availability zone, az-<id>
#   POD_NAMESPACE                 downward API, metadata.namespace
#   BROKER_ENDPOINT               e.g. http://storage-broker.neon.svc.cluster.local:50051
#   S3_BUCKET S3_REGION S3_ENDPOINT   from Secret neon-s3 (S3_ENDPOINT may be empty)
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY   read by the S3 client directly
#   JWT_DIR                       directory with public.pem and safekeeper-token (the latter is
#                                 key SAFEKEEPER_JWT_TOKEN of Secret neon-jwt)

set -eu

die() { printf 'safekeeper-entrypoint: ERROR: %s\n' "$*" >&2; exit 1; }

for _name in SAFEKEEPER_ID SAFEKEEPER_AZ POD_NAMESPACE BROKER_ENDPOINT S3_BUCKET S3_REGION JWT_DIR; do
    eval "_val=\${$_name:-}"
    [ -n "$_val" ] || die "required environment variable $_name is empty or unset"
done
S3_ENDPOINT="${S3_ENDPOINT:-}"

case "$SAFEKEEPER_ID" in
    ''|*[!0-9]*|0|0[0-9]*) die "SAFEKEEPER_ID='$SAFEKEEPER_ID' is not a positive integer" ;;
esac
SK_ID="$SAFEKEEPER_ID"
AZ="$SAFEKEEPER_AZ"

# The address other nodes use to reach this safekeeper's WAL service: the name
# of its own Service, which stays the same across pod restarts and rescheduling
# (unlike the pod IP). The control-plane worker registers the same name with the
# storage controller.
ADVERTISE_PG="safekeeper-$SK_ID.$POD_NAMESPACE.svc.cluster.local:5454"

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
