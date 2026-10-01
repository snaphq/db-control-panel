#!/bin/sh
# Pageserver init step: render the three files a pageserver needs into its
# working directory before `pageserver -D <workdir>` starts.
#
#   identity.toml    id = <ALLOYDB_NODE_ID>
#   metadata.json    registration data the pageserver sends to the storage
#                    controller on start (pageserver/src/controller_upcall_client.rs,
#                    re_attach)
#   pageserver.toml  the pageserver config (libs/pageserver_api/src/config.rs,
#                    ConfigToml)
#
# Runs as root in an init container of the pageserver DaemonSet, because the
# hostPath data directory is created by the kubelet as root. At the end it
# hands the directory to the unprivileged uid the main container runs as.
#
# Inputs
#   files   $NODE_ENV_FILE  /etc/alloydb/node.env, written by the node-join
#                           playbook (keys ALLOYDB_NODE_ID, ALLOYDB_AZ,
#                           ALLOYDB_TAILSCALE_IP). KEY=value lines; surrounding
#                           quotes and a leading `export ` are tolerated.
#   env     $WORKDIR $RUN_AS_UID $RUN_AS_GID $BROKER_ENDPOINT $CONTROL_PLANE_API
#           $PG_DISTRIB_DIR $AUTH_PUBLIC_KEY_PATH   from the pod spec
#           $S3_BUCKET $S3_REGION $S3_ENDPOINT      from Secret neon-s3
#           $GENERATIONS_API_TOKEN                  from Secret neon-jwt
#
# Re-run on every pod start, so a changed manifest or a resized disk takes
# effect on the next restart. Nothing is written to stdout that is secret.

set -eu
umask 077 # pageserver.toml carries the generations-API token

log() { printf 'pageserver-render-config: %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

require_env() {
    for _name in "$@"; do
        eval "_val=\${$_name:-}"
        [ -n "$_val" ] || die "required environment variable $_name is empty or unset"
    done
}

# Print the value of KEY from $NODE_ENV_FILE (last assignment wins).
node_env() {
    sed -n -e "s/^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}$1=//p" "$NODE_ENV_FILE" \
        | tail -n 1 \
        | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e "s/^\"\(.*\)\"\$/\1/" -e "s/^'\(.*\)'\$/\1/"
}

require_env NODE_ENV_FILE WORKDIR RUN_AS_UID RUN_AS_GID BROKER_ENDPOINT \
    CONTROL_PLANE_API PG_DISTRIB_DIR AUTH_PUBLIC_KEY_PATH \
    S3_BUCKET S3_REGION GENERATIONS_API_TOKEN
# S3_ENDPOINT may be empty: that means "real AWS S3, derive the endpoint from the region".
S3_ENDPOINT="${S3_ENDPOINT:-}"

[ -r "$NODE_ENV_FILE" ] || die "cannot read $NODE_ENV_FILE (is the node joined with the playbook?)"

# ---------------------------------------------------------------- node identity
NODE_ID="$(node_env ALLOYDB_NODE_ID)"
AZ="$(node_env ALLOYDB_AZ)"
NODE_IP="$(node_env ALLOYDB_TAILSCALE_IP)"

# Fail fast on anything that would produce a config the pageserver silently
# misreads. The patterns also make the unquoted values below safe to embed.
case "$NODE_ID" in ''|*[!0-9]*|0|0[0-9]*) die "ALLOYDB_NODE_ID must be a positive integer, got '$NODE_ID'" ;; esac
case "$AZ" in az-[0-9]*) : ;; *) die "ALLOYDB_AZ must look like az-<n>, got '$AZ'" ;; esac
case "$AZ" in *[!a-z0-9-]*) die "ALLOYDB_AZ contains unexpected characters: '$AZ'" ;; esac
printf '%s\n' "$NODE_IP" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$' \
    || die "ALLOYDB_TAILSCALE_IP must be an IPv4 address, got '$NODE_IP'"
log "node id=$NODE_ID az=$AZ ip=$NODE_IP"

# ------------------------------------------------------------------- directory
mkdir -p "$WORKDIR"

# The id is the node's identity in the storage controller. A data directory
# that already belongs to another id must never be started under this one.
if [ -f "$WORKDIR/identity.toml" ]; then
    EXISTING_ID="$(sed -n 's/^[[:space:]]*id[[:space:]]*=[[:space:]]*\([0-9]\{1,\}\).*/\1/p' "$WORKDIR/identity.toml" | head -n 1)"
    if [ -n "$EXISTING_ID" ] && [ "$EXISTING_ID" != "$NODE_ID" ]; then
        die "$WORKDIR/identity.toml has id=$EXISTING_ID but node.env says $NODE_ID; refusing to reuse the data directory"
    fi
fi

# Write a file atomically: render to a temp file in the same directory, then rename.
# Usage: install_file <name> <mode>   (content on stdin)
install_file() {
    _tmp="$WORKDIR/.$1.tmp"
    cat > "$_tmp"
    chmod "$2" "$_tmp"
    mv -f "$_tmp" "$WORKDIR/$1"
}

# --------------------------------------------------------------- identity.toml
printf 'id = %s\n' "$NODE_ID" | install_file identity.toml 0644

# --------------------------------------------------------------- metadata.json
# NodeMetadata (libs/pageserver_api/src/config.rs): `host`/`port` is the
# libpq (page service) address and `http_host`/`http_port` the management API;
# both are what computes and the controller dial, so they must be the stable
# Tailscale IP. grpc_*/https_port are optional and left out.
# `availability_zone_id` is not a named field: it travels in `other` and is read
# by re_attach in controller_upcall_client.rs.
printf '{"host":"%s","port":6400,"http_host":"%s","http_port":9898,"availability_zone_id":"%s"}\n' \
    "$NODE_IP" "$NODE_IP" "$AZ" | install_file metadata.json 0644

# ------------------------------------------------------- sizing from the host
# Memory: /proc/meminfo is the host's, because the pod is not memory-namespaced
# for this file and runs on the host network.
MEM_KB="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
case "$MEM_KB" in ''|*[!0-9]*) die "cannot read MemTotal from /proc/meminfo" ;; esac

# page_cache_size is a count of 8 kB blocks (docs/settings.md, page_cache_size).
# Take ~10% of host memory (KB / 8 / 10 = KB / 80), within [8192 (64 MiB, the
# upstream default), 262144 (2 GiB)]. Most memory is better left to the OS page
# cache, which serves layer file reads.
PAGE_CACHE_BLOCKS=$((MEM_KB / 80))
[ "$PAGE_CACHE_BLOCKS" -ge 8192 ] || PAGE_CACHE_BLOCKS=8192
[ "$PAGE_CACHE_BLOCKS" -le 262144 ] || PAGE_CACHE_BLOCKS=262144

# Disk: size of the filesystem that holds the data directory. `df -P -k` is the
# POSIX layout (1024-byte blocks); the arithmetic is done in sh so large
# disks cannot overflow awk.
DISK_KB="$(df -P -k "$WORKDIR" | awk 'NR==2 {print $2}')"
case "$DISK_KB" in ''|*[!0-9]*) die "cannot read the size of the filesystem under $WORKDIR" ;; esac
DISK_BYTES=$((DISK_KB * 1024))

# disk_usage_based_eviction (DiskUsageEvictionTaskConfig): the pageserver
# evicts cold layers (they stay in S3) when EITHER usage >= max_usage_pct OR
# free space < min_avail_bytes. The data directory shares its filesystem with
# the OS, so leave headroom that grows with the disk:
#   max_usage_pct   80 below 200 GB, 85 below 1 TB, 90 above
#   min_avail_bytes 5% of the disk, never below the upstream 2 GB default
if [ "$DISK_BYTES" -lt 200000000000 ]; then
    MAX_USAGE_PCT=80
elif [ "$DISK_BYTES" -lt 1000000000000 ]; then
    MAX_USAGE_PCT=85
else
    MAX_USAGE_PCT=90
fi
MIN_AVAIL_BYTES=$((DISK_BYTES / 20))
[ "$MIN_AVAIL_BYTES" -ge 2000000000 ] || MIN_AVAIL_BYTES=2000000000
log "sizing: mem=${MEM_KB}kB -> page_cache_size=${PAGE_CACHE_BLOCKS}; disk=${DISK_BYTES}B -> max_usage_pct=${MAX_USAGE_PCT} min_avail_bytes=${MIN_AVAIL_BYTES}"

# ------------------------------------------------------------- pageserver.toml
# S3: bucket_name/bucket_region/prefix_in_bucket/endpoint are the S3Config keys
# (libs/remote_storage/src/config.rs). When `endpoint` is set the client also
# switches to path-style addressing (s3_bucket.rs), which MinIO-like and
# non-AWS stores need. Credentials come from AWS_ACCESS_KEY_ID /
# AWS_SECRET_ACCESS_KEY in the main container's environment (default AWS
# credential chain), never from this file.
REMOTE_STORAGE="bucket_name = '$S3_BUCKET', bucket_region = '$S3_REGION', prefix_in_bucket = 'pageserver/'"
if [ -n "$S3_ENDPOINT" ]; then
    REMOTE_STORAGE="$REMOTE_STORAGE, endpoint = '$S3_ENDPOINT'"
fi

# Values are TOML literal strings (single quotes): no escaping happens inside,
# so a value containing a single quote would break the file. Reject that.
for _v in "$S3_BUCKET" "$S3_REGION" "$S3_ENDPOINT" "$BROKER_ENDPOINT" \
          "$CONTROL_PLANE_API" "$PG_DISTRIB_DIR" "$AUTH_PUBLIC_KEY_PATH" \
          "$GENERATIONS_API_TOKEN"; do
    case "$_v" in *"'"*) die "a configuration value contains a single quote, which pageserver.toml cannot carry" ;; esac
done

install_file pageserver.toml 0600 <<EOF
# Rendered by pageserver-render-config.sh on every pod start. Do not edit.
# Unknown keys are silently ignored by the pageserver (ConfigToml doc comment),
# so every key below was checked against ConfigToml by name.

# Bound to the Tailscale IP: this is the address that gets registered.
listen_pg_addr = '$NODE_IP:6400'
listen_http_addr = '$NODE_IP:9898'
availability_zone = '$AZ'

broker_endpoint = '$BROKER_ENDPOINT'

# Generations: the pageserver asks the storage controller for its attachments
# (POST <control_plane_api>re-attach, .../validate). Token scope generations_api.
control_plane_api = '$CONTROL_PLANE_API'
control_plane_api_token = '$GENERATIONS_API_TOKEN'

# The image installs one Postgres per major version under /usr/local/v<N>.
pg_distrib_dir = '$PG_DISTRIB_DIR'

# JWT (EdDSA) on both the management API and the page service. The public key
# is mounted from Secret neon-jwt. The pageserver refuses to start if the file
# is missing.
http_auth_type = 'NeonJWT'
pg_auth_type = 'NeonJWT'
auth_validation_public_key_path = '$AUTH_PUBLIC_KEY_PATH'

remote_storage = { $REMOTE_STORAGE }

# Sized from this host at pod start (see the script header).
page_cache_size = $PAGE_CACHE_BLOCKS
max_file_descriptors = 4096
disk_usage_based_eviction = { enabled = true, max_usage_pct = $MAX_USAGE_PCT, min_avail_bytes = $MIN_AVAIL_BYTES, period = '60s' }
EOF

# ------------------------------------------------------------------ ownership
# Hand the directory to the uid/gid of the main container. Walking a large
# tenants/ tree on every start would be slow, so recurse only when the top
# level is not already owned correctly (first run, or ownership was reset).
if [ "$(stat -c '%u:%g' "$WORKDIR")" != "$RUN_AS_UID:$RUN_AS_GID" ]; then
    log "changing ownership of $WORKDIR to $RUN_AS_UID:$RUN_AS_GID (recursive)"
    chown -R "$RUN_AS_UID:$RUN_AS_GID" "$WORKDIR"
else
    chown "$RUN_AS_UID:$RUN_AS_GID" "$WORKDIR/identity.toml" "$WORKDIR/metadata.json" "$WORKDIR/pageserver.toml"
fi
log "rendered identity.toml, metadata.json, pageserver.toml in $WORKDIR"
