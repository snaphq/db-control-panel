import type { V1Container, V1Pod } from '@kubernetes/client-node';
import { computeResources } from './compute-size.js';

/**
 * Pod manifest of one running endpoint, laid out as in
 * docs-internal/platform/architecture.mdx ("Computes"). A pure function: the
 * runtime creates whatever this returns.
 */

export const COMPUTE_NAMESPACE = 'neon-compute';
const DEFAULT_PULL_SECRET = 'ghcr-pull';
/** compute_ctl's external HTTP port (`--external-http-port`, compute_ctl.rs:77). */
export const COMPUTE_CTL_PORT = 3080;
const POSTGRES_PORT = 5432;
const PGBOUNCER_PORT = 6432;
const PGDATA = '/var/db/postgres/compute';

export const computePodName = (endpointId: string): string =>
  `compute-${endpointId}`;

const LABEL_ENDPOINT = 'alloydb.net/endpoint';
const LABEL_PROJECT = 'alloydb.net/project';
const LABEL_BRANCH = 'alloydb.net/branch';

/** One PostgREST container serving the Data API of a database. */
export interface PostgrestSidecar {
  database: string;
  /** Position among the endpoint's Data API databases: ports are 3000+n and 3100+n. */
  index: number;
  /** libpq URI for `authenticator` on 127.0.0.1:5432. */
  dbUri: string;
  /** JWKS (or secret) PostgREST verifies bearer tokens with (`PGRST_JWT_SECRET`). */
  jwtSecret: string;
}

/**
 * Data API databases per endpoint. Sidecar `n` listens on 3000+n and its admin
 * server on 3100+n; compute_ctl owns 3080, so the API ports stop at 3049 and a
 * NetworkPolicy can open exactly 3000-3049 to the gateway.
 */
export const MAX_DATA_API_DATABASES = 50;

export interface ComputePodInput {
  endpointId: string;
  projectId: string;
  branchId: string;
  computeSize: string;
  /** `NEON_CONTROL_PLANE_TOKEN`: the tenantendpoint token compute_ctl presents to fetch its spec. */
  specToken: string;
  /** Base URL compute_ctl appends `/compute/api/v2/computes/<id>/spec` to. */
  controlPlaneUri: string;
  computeImage: string;
  postgrestImage: string;
  /**
   * Pull Secret name; null for none, undefined for `ghcr-pull`. Kubernetes only
   * warns about a pull Secret that does not exist, so the default is safe while
   * the images are public.
   */
  pullSecret?: string | null;
  sidecars?: PostgrestSidecar[];
}

export const postgrestApiPort = (index: number): number => 3000 + index;
const postgrestAdminPort = (index: number): number => 3100 + index;

/** Container names are DNS labels, but database names may hold underscores. */
export function postgrestContainerName(database: string): string {
  const label = database
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '');
  return `postgrest-${label}`.slice(0, 63).replace(/-+$/g, '');
}

const containerSecurity = {
  allowPrivilegeEscalation: false,
  capabilities: { drop: ['ALL'] },
};

/**
 * One PostgREST per database (v16.4 docs/references/configuration.rst). It is
 * the authenticator on 127.0.0.1 and serves on the pod IP so the gateway can
 * reach it (`server-host` `!4` is any IPv4 address, the documented default). The
 * admin server (/live, /ready, /schema_cache) stays on loopback. The pool is
 * small because the compute shares its `max_connections` with the user's own
 * clients, and `GHCRTS=-N1` limits the Haskell runtime to one capability.
 * The channel stays on: PostgREST connects to Postgres directly, not through
 * PgBouncer, so LISTEN works and `NOTIFY pgrst` reloads the schema cache.
 */
function postgrestContainer(
  sidecar: PostgrestSidecar,
  image: string,
): V1Container {
  if (sidecar.index < 0 || sidecar.index >= MAX_DATA_API_DATABASES) {
    throw new Error(
      `Data API index ${sidecar.index} is outside 0-${MAX_DATA_API_DATABASES - 1}`,
    );
  }
  const api = postgrestApiPort(sidecar.index);
  const admin = postgrestAdminPort(sidecar.index);
  return {
    name: postgrestContainerName(sidecar.database),
    image,
    ports: [
      { name: `api-${sidecar.index}`, containerPort: api },
      { name: `admin-${sidecar.index}`, containerPort: admin },
    ],
    env: [
      { name: 'PGRST_DB_URI', value: sidecar.dbUri },
      { name: 'PGRST_DB_SCHEMAS', value: 'public' },
      { name: 'PGRST_DB_ANON_ROLE', value: 'anonymous' },
      { name: 'PGRST_JWT_SECRET', value: sidecar.jwtSecret },
      { name: 'PGRST_JWT_ROLE_CLAIM_KEY', value: '$.role' },
      { name: 'PGRST_SERVER_HOST', value: '!4' },
      { name: 'PGRST_SERVER_PORT', value: String(api) },
      { name: 'PGRST_ADMIN_SERVER_HOST', value: '127.0.0.1' },
      { name: 'PGRST_ADMIN_SERVER_PORT', value: String(admin) },
      { name: 'PGRST_DB_POOL', value: '5' },
      { name: 'GHCRTS', value: '-N1' },
    ],
    resources: {
      requests: { cpu: '50m', memory: '128Mi' },
      limits: { cpu: '500m', memory: '256Mi' },
    },
    securityContext: containerSecurity,
  };
}

function pullSecrets(name: string | null | undefined) {
  const secret = name === undefined ? DEFAULT_PULL_SECRET : name;
  return secret === null ? {} : { imagePullSecrets: [{ name: secret }] };
}

export function buildComputePod(input: ComputePodInput): V1Pod {
  const resources = computeResources(input.computeSize);
  const labels = {
    'app.kubernetes.io/name': 'compute',
    'app.kubernetes.io/managed-by': 'alloydb-control-plane',
    [LABEL_ENDPOINT]: input.endpointId,
    [LABEL_PROJECT]: input.projectId,
    [LABEL_BRANCH]: input.branchId,
  };
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: computePodName(input.endpointId),
      namespace: COMPUTE_NAMESPACE,
      labels,
    },
    spec: {
      // A compute that exits is gone: the control plane decides when to start
      // another, so the kubelet must not restart it behind our back.
      restartPolicy: 'Never',
      terminationGracePeriodSeconds: 15,
      automountServiceAccountToken: false,
      enableServiceLinks: false,
      ...pullSecrets(input.pullSecret),
      nodeSelector: { 'alloydb.net/compute': 'true' },
      topologySpreadConstraints: [
        {
          maxSkew: 1,
          topologyKey: 'kubernetes.io/hostname',
          whenUnsatisfiable: 'ScheduleAnyway',
          labelSelector: {
            matchLabels: { 'app.kubernetes.io/name': 'compute' },
          },
        },
      ],
      securityContext: { seccompProfile: { type: 'RuntimeDefault' } },
      volumes: [{ name: 'pgdata', emptyDir: { sizeLimit: '10Gi' } }],
      containers: [
        {
          name: 'compute',
          image: input.computeImage,
          command: ['/usr/local/bin/compute_ctl'],
          args: [
            '--control-plane-uri',
            input.controlPlaneUri,
            '--compute-id',
            input.endpointId,
            '--pgdata',
            PGDATA,
            '--pgbin',
            '/usr/local/bin/postgres',
            '--connstr',
            `postgresql://cloud_admin@127.0.0.1:${POSTGRES_PORT}/postgres`,
          ],
          ports: [
            { name: 'postgres', containerPort: POSTGRES_PORT },
            { name: 'compute-ctl', containerPort: COMPUTE_CTL_PORT },
          ],
          env: [{ name: 'NEON_CONTROL_PLANE_TOKEN', value: input.specToken }],
          volumeMounts: [{ name: 'pgdata', mountPath: PGDATA }],
          resources: {
            requests: { cpu: resources.cpu, memory: resources.memory },
            limits: { cpu: resources.cpu, memory: resources.memory },
          },
          securityContext: containerSecurity,
        },
        {
          // Neon's VM image starts PgBouncer; compute_ctl does not.
          name: 'pgbouncer',
          image: input.computeImage,
          command: ['/usr/local/bin/pgbouncer'],
          args: ['/etc/pgbouncer.ini'],
          ports: [{ name: 'pgbouncer', containerPort: PGBOUNCER_PORT }],
          resources: {
            requests: { cpu: '50m', memory: '64Mi' },
            limits: { cpu: '500m', memory: '256Mi' },
          },
          securityContext: containerSecurity,
        },
        ...(input.sidecars ?? []).map((s) =>
          postgrestContainer(s, input.postgrestImage),
        ),
      ],
    },
  };
}
