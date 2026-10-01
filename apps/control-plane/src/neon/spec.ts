import type { Ed25519Signer } from '../crypto/ed25519.js';
import { sizedSettings } from './compute-size.js';
import { SAFEKEEPER_PG_PORT } from './safekeepers.js';
import type { LocateResponse, StorconNode } from './storcon-client.js';
import type {
  BranchRow,
  DatabaseRow,
  EndpointRow,
  ProjectRow,
  RoleRow,
} from './store.js';
import { mintStorageToken } from './tokens.js';

/**
 * Builds the response of `GET /compute/api/v2/computes/:id/spec`, which
 * compute_ctl parses as `ControlPlaneConfigResponse`
 * (libs/compute_api/src/responses.rs:317-334) and also receives as the body of
 * `POST /configure` (`ConfigurationRequest`, requests.rs:64-68). Everything
 * here is a pure function of its inputs, so the output is unit-tested without a
 * cluster.
 */

/** `GenericOption` (libs/compute_api/src/spec.rs:572-577). `vartype` picks quoting in postgresql.conf. */
interface GenericOption {
  name: string;
  value: string;
  vartype: 'string' | 'integer' | 'bool' | 'enum';
}

interface SpecRole {
  name: string;
  /** SCRAM secrets are passed through; anything else is treated as md5 (pg_helpers.rs:151-161). */
  encrypted_password: string;
  options: null;
}

interface SpecDatabase {
  name: string;
  owner: string;
  options: null;
}

/** `DeltaOp` (spec.rs:538-543): one-off changes a state-only spec cannot express. */
export interface DeltaOperation {
  action: 'delete_db';
  name: string;
  new_name: null;
}

/** `PageserverConnectionInfo` (spec.rs:237-251). */
export interface PageserverConnectionInfo {
  /** 0 for an unsharded tenant; `ShardCount` is a bare number on the wire. */
  shard_count: number;
  stripe_size: number | null;
  /** Keyed by `ShardIndex`, serialized as `<2 hex shard number><2 hex shard count>`. */
  shards: Record<
    string,
    {
      pageservers: {
        id: number;
        libpq_url: string | null;
        grpc_url: string | null;
      }[];
    }
  >;
  prefer_protocol: 'libpq' | 'grpc';
}

type ComputeModeWire = 'Primary' | 'Replica';

interface ComputeSpecWire {
  format_version: number;
  suspend_timeout_seconds: number;
  features: string[];
  skip_pg_catalog_updates: boolean;
  reconfigure_concurrency: number;
  drop_subscriptions_before_start: boolean;
  audit_log_level: 'Disabled';
  autoprewarm: boolean;
  cluster: {
    cluster_id: string;
    name: string;
    state: null;
    roles: SpecRole[];
    databases: SpecDatabase[];
    postgresql_conf: null;
    settings: GenericOption[];
  };
  delta_operations: DeltaOperation[] | null;
  tenant_id: string;
  timeline_id: string;
  project_id: string;
  branch_id: string;
  endpoint_id: string;
  mode: ComputeModeWire;
  pageserver_connection_info: PageserverConnectionInfo;
  safekeeper_connstrings: string[];
  safekeepers_generation: number | null;
  storage_auth_token: string;
}

export interface ComputeConfigResponse {
  status: 'attached';
  spec: ComputeSpecWire;
  compute_ctl_config: { jwks: Ed25519Signer['jwks'] };
}

/** Raised when the data a spec needs is not there yet; callers answer 503 so the compute retries. */
export class SpecNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpecNotReadyError';
  }
}

// ---- pageserver placement ---------------------------------------------------------

const TENANT_ID = /^[0-9a-f]{32}$/;
const SHARD_SLUG = /^[0-9a-f]{4}$/;

/**
 * `ShardIndex` as serde writes it (libs/utils/src/shard.rs:300-304, 413-424): two bytes
 * in hex, shard number first, then shard count: "0000" for an unsharded tenant.
 * Accepts a `TenantShardId` (shard.rs:206-262): either the bare 32-hex tenant id
 * (unsharded) or `<tenant>-<slug>`.
 */
export function shardIndexKey(tenantShardId: string): string {
  if (TENANT_ID.test(tenantShardId)) return '0000';
  const slug = tenantShardId.slice(33).toLowerCase();
  if (
    tenantShardId.length === 37 &&
    tenantShardId[32] === '-' &&
    TENANT_ID.test(tenantShardId.slice(0, 32)) &&
    SHARD_SLUG.test(slug)
  ) {
    return slug;
  }
  throw new Error(`Not a TenantShardId: ${JSON.stringify(tenantShardId)}`);
}

const hostForUrl = (host: string): string =>
  host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;

/** `postgres://no_user@host:port`, as in `tenant_locate_response_to_conn_info` (control_plane/src/endpoint.rs:1258-1299). */
function pageserverEntry(
  nodeId: number,
  pg: { addr: string; port: number },
  grpc: { addr: string | null | undefined; port: number | null | undefined },
) {
  return {
    id: nodeId,
    libpq_url: `postgres://no_user@${hostForUrl(pg.addr)}:${pg.port}`,
    grpc_url:
      grpc.addr && grpc.port
        ? `grpc://no_user@${hostForUrl(grpc.addr)}:${grpc.port}`
        : null,
  };
}

export function locateToConnectionInfo(
  locate: LocateResponse,
): PageserverConnectionInfo {
  const shards: PageserverConnectionInfo['shards'] = {};
  for (const shard of locate.shards) {
    shards[shardIndexKey(shard.shard_id)] = {
      pageservers: [
        pageserverEntry(
          shard.node_id,
          { addr: shard.listen_pg_addr, port: shard.listen_pg_port },
          { addr: shard.listen_grpc_addr, port: shard.listen_grpc_port },
        ),
      ],
    };
  }
  return {
    shard_count: locate.shard_params.count,
    // Null when unsharded, otherwise immutable (spec.rs:237-244).
    stripe_size:
      locate.shard_params.count === 0 ? null : locate.shard_params.stripe_size,
    shards,
    prefer_protocol: 'libpq',
  };
}

/** Body of `PUT /storcon/notify-attach` (storage_controller/src/compute_hook.rs:329-342). */
export interface AttachNotification {
  tenant_id: string;
  stripe_size: number | null;
  shards: { node_id: number; shard_number: number }[];
}

/**
 * The same placement as {@link locateToConnectionInfo}, built from an attach
 * notification and the controller's node list. The hook sends `stripe_size`
 * only for a sharded tenant, so its presence is what sets the shard count.
 */
export function attachToConnectionInfo(
  attach: AttachNotification,
  nodes: StorconNode[],
): PageserverConnectionInfo {
  const sharded = attach.stripe_size !== null;
  const shardCount = sharded ? attach.shards.length : 0;
  const shards: PageserverConnectionInfo['shards'] = {};
  for (const shard of attach.shards) {
    const node = nodes.find((n) => n.id === shard.node_id);
    if (!node) {
      throw new SpecNotReadyError(
        `Pageserver ${shard.node_id} is not in the storage controller's node list`,
      );
    }
    const key =
      shard.shard_number.toString(16).padStart(2, '0') +
      shardCount.toString(16).padStart(2, '0');
    shards[key] = {
      pageservers: [
        pageserverEntry(
          node.id,
          { addr: node.listen_pg_addr, port: node.listen_pg_port },
          { addr: null, port: null },
        ),
      ],
    };
  }
  return {
    shard_count: shardCount,
    stripe_size: attach.stripe_size,
    shards,
    prefer_protocol: 'libpq',
  };
}

// ---- settings -----------------------------------------------------------------------

const option = (
  name: string,
  value: string | number,
  vartype: GenericOption['vartype'],
): GenericOption => ({ name, value: String(value), vartype });

const MIB = (value: number): string => `${value}MB`;

/**
 * Postgres settings the control plane owns. compute_ctl itself appends
 * `neon.tenant_id`, `neon.timeline_id`, `neon.safekeepers`,
 * `neon.pageserver_connstring` and the other `neon.*` ids from the spec fields
 * (compute_tools/src/config.rs:49-204), so none of those are repeated here.
 */
function buildSettings(
  endpoint: EndpointRow,
  branch: BranchRow,
  project: ProjectRow,
  safekeeperHosts: string[],
): GenericOption[] {
  const sized = sizedSettings(endpoint.computeSize);
  const primary = endpoint.type === 'read_write';
  const settings: GenericOption[] = [
    option('wal_level', 'logical', 'enum'),
    option(
      'shared_preload_libraries',
      'neon,pg_cron,pg_stat_statements',
      'string',
    ),
    option('password_encryption', 'scram-sha-256', 'enum'),
    option('listen_addresses', '*', 'string'),
    option('port', 5432, 'integer'),
    option('max_connections', sized.maxConnections, 'integer'),
    option('shared_buffers', MIB(sized.sharedBuffersMiB), 'string'),
    option('effective_cache_size', MIB(sized.effectiveCacheSizeMiB), 'string'),
    option('maintenance_work_mem', MIB(sized.maintenanceWorkMemMiB), 'string'),
    option('max_wal_senders', 10, 'integer'),
    option('max_replication_slots', 10, 'integer'),
    option('wal_sender_timeout', '5s', 'string'),
    option('wal_keep_size', 0, 'integer'),
    option('wal_log_hints', 'on', 'bool'),
    option('fsync', 'off', 'bool'),
    option('restart_after_crash', 'off', 'bool'),
    option('hot_standby', 'on', 'bool'),
    option('log_connections', 'on', 'bool'),
    option('cron.database_name', 'postgres', 'string'),
  ];
  if (primary) {
    settings.push(
      option('synchronous_standby_names', 'walproposer', 'string'),
      option('max_replication_write_lag', '500MB', 'string'),
      option('max_replication_flush_lag', '10GB', 'string'),
    );
  } else {
    // A replica follows the primary's WAL through the safekeepers. This mirrors
    // the `ComputeMode::Replica` branch of control_plane/src/endpoint.rs:539-570.
    const hosts = safekeeperHosts.join(',');
    const ports = safekeeperHosts.map(() => SAFEKEEPER_PG_PORT).join(',');
    settings.push(
      option(
        'primary_conninfo',
        `host=${hosts} port=${ports} options='-c timeline_id=${branch.timelineId} tenant_id=${project.tenantId}' application_name=replica replication=true`,
        'string',
      ),
      option('primary_slot_name', `repl_${branch.timelineId}_`, 'string'),
      option('recovery_prefetch', 'off', 'enum'),
    );
  }
  return settings;
}

// ---- the spec -------------------------------------------------------------------------

export interface BuildSpecInput {
  endpoint: EndpointRow;
  branch: BranchRow;
  project: ProjectRow;
  roles: RoleRow[];
  databases: DatabaseRow[];
  pageservers: PageserverConnectionInfo;
  /** Signs the tenant-scoped `storage_auth_token`; its JWKS goes into `compute_ctl_config`. */
  signer: Ed25519Signer;
  /** One-off `delete_db` operations to apply with this spec. */
  deltaOperations?: DeltaOperation[];
  now?: Date;
}

export function buildComputeConfig(
  input: BuildSpecInput,
): ComputeConfigResponse {
  const { endpoint, branch, project, signer } = input;
  const placement = branch.safekeepers;
  if (!placement || placement.safekeepers.length === 0) {
    // The timeline was created without safekeepers, or project creation is
    // still running: a primary cannot start without them.
    throw new SpecNotReadyError(
      `Branch ${branch.id} has no safekeeper placement yet`,
    );
  }
  const hosts = placement.safekeepers.map((sk) => sk.hostname);
  const primary = endpoint.type === 'read_write';

  const spec: ComputeSpecWire = {
    format_version: 1.0,
    suspend_timeout_seconds: endpoint.suspendTimeoutSeconds,
    features: [],
    skip_pg_catalog_updates: false,
    reconfigure_concurrency: 1,
    drop_subscriptions_before_start: false,
    audit_log_level: 'Disabled',
    autoprewarm: false,
    cluster: {
      cluster_id: project.id,
      name: project.name,
      state: null,
      roles: input.roles.map((r) => ({
        name: r.name,
        encrypted_password: r.scramSecret,
        options: null,
      })),
      databases: input.databases.map((d) => ({
        name: d.name,
        owner: d.ownerRole,
        options: null,
      })),
      postgresql_conf: null,
      settings: buildSettings(endpoint, branch, project, hosts),
    },
    delta_operations: input.deltaOperations?.length
      ? input.deltaOperations
      : null,
    tenant_id: project.tenantId,
    timeline_id: branch.timelineId,
    project_id: project.id,
    branch_id: branch.id,
    endpoint_id: endpoint.id,
    mode: primary ? 'Primary' : 'Replica',
    pageserver_connection_info: input.pageservers,
    // Only a primary runs walproposer (control_plane/src/endpoint.rs:671-685).
    safekeeper_connstrings: primary
      ? hosts.map((host) => `${host}:${SAFEKEEPER_PG_PORT}`)
      : [],
    safekeepers_generation: primary ? placement.generation : null,
    storage_auth_token: mintStorageToken(
      signer,
      { scope: 'tenant', tenantId: project.tenantId },
      input.now,
    ),
  };
  return {
    status: 'attached',
    spec,
    compute_ctl_config: { jwks: signer.jwks },
  };
}
