import { z } from 'zod';
import { parseDataKey } from './crypto/secretbox.js';

const MODES = ['api', 'neon-glue', 'worker', 'data-api-gateway'] as const;

type Mode = (typeof MODES)[number];

/** Raised for any invalid or incomplete environment; the message names every offending key. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function required(description: string) {
  return z
    .string({ required_error: `is required (${description})` })
    .min(1, `is required (${description})`);
}

const dataKey = required(
  '32 random bytes, base64; generate one with: openssl rand -base64 32',
).refine((value) => {
  try {
    parseDataKey(value);
    return true;
  } catch {
    return false;
  }
}, 'must be base64 of exactly 32 bytes (openssl rand -base64 32)');

const baseShape = {
  DATABASE_URL: required('connection string of the control_plane database')
    .url(
      'must be a URL such as postgresql://user:password@host:5432/control_plane',
    )
    .refine(
      (value) => /^postgres(ql)?:\/\//.test(value),
      'must start with postgres:// or postgresql://',
    ),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  ALLOYDB_DATA_KEY: dataKey,
};

const libsqlHostSuffix = z.string().min(1).default('lite.alloydb.net');
const dataApiHostSuffix = z.string().min(1).default('apirest.alloydb.net');

/** Tunables with defaults that match docs-internal/platform/architecture.mdx. */
const computeShape = {
  ALLOYDB_COMPUTE_IMAGE: z
    .string()
    .min(1)
    .default('ghcr.io/snaphq/neon-compute-v17:latest'),
  ALLOYDB_POSTGREST_IMAGE: z
    .string()
    .min(1)
    .default('ghcr.io/snaphq/postgrest:latest'),
  ALLOYDB_NEON_GLUE_URL: z
    .string()
    .url()
    .default('http://neon-glue.alloydb-system:8080'),
  /**
   * Pull secret on compute pods. A missing Secret only raises a warning event,
   * so the default is safe while the images are public; `none` omits it.
   */
  ALLOYDB_IMAGE_PULL_SECRET: z.string().min(1).default('ghcr-pull'),
};

/** Safekeepers to run; must equal the storage controller's `--timeline-safekeeper-count`. */
const safekeeperCount = z.coerce.number().int().min(1).max(9).default(3);
/** Size of each safekeeper's volume. */
const safekeeperStorage = z
  .string()
  .regex(/^\d+(Ki|Mi|Gi|Ti)$/, 'must be a quantity such as 50Gi')
  .default('50Gi');

const boolean = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'], { message: 'must be "true" or "false"' })
    .default(fallback)
    .transform((value) => value === 'true');

/** Platform operations (safekeeper spreading, pageserver rebalancing), worker only. */
const platformShape = {
  /** Image of the safekeeper pods the worker creates; the manifests set it with the other images. */
  ALLOYDB_NEON_IMAGE: z.string().min(1).default('ghcr.io/snaphq/neon:latest'),
  /** ConfigMap holding safekeeper-entrypoint.sh (infra/k8s/neon). */
  ALLOYDB_SAFEKEEPER_ENTRYPOINT_CONFIGMAP: z
    .string()
    .min(1)
    .default('safekeeper-entrypoint'),
  ALLOYDB_SAFEKEEPER_STORAGE: safekeeperStorage,
  ALLOYDB_AUTO_SPREAD_SAFEKEEPERS: boolean('true'),
  ALLOYDB_SAFEKEEPER_MIGRATE_CONCURRENCY: z.coerce
    .number()
    .int()
    .min(1)
    .max(8)
    .default(2),
  ALLOYDB_AUTO_REBALANCE: boolean('true'),
  ALLOYDB_REBALANCE_MAX_MOVES: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(8),
  ALLOYDB_REBALANCE_PREWARM: boolean('true'),
  /** Longest a single tenant move may take to settle before it is cancelled. */
  ALLOYDB_REBALANCE_SETTLE_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(86_400)
    .default(900),
};

const neonShape = {
  ...computeShape,
  STORAGE_CONTROLLER_URL: required(
    'storage controller base URL, e.g. http://storage-controller.neon:1234',
  ).url(),
  NEON_JWT_PRIVATE_KEY_PATH: required(
    'path of the Ed25519 PKCS#8 PEM that signs every Neon token',
  ),
  CONTROL_PLANE_JWT_TOKEN: required(
    'admin-scoped Neon token shared with the storage controller',
  ),
};

const envSchema = z.discriminatedUnion('ALLOYDB_MODE', [
  z.object({
    ALLOYDB_MODE: z.literal('api'),
    ...baseShape,
    ALLOYDB_API_TOKEN: required('bearer token held by the console server'),
    ALLOYDB_PG_HOST_SUFFIX: z.string().min(1).default('pg.alloydb.net'),
    ALLOYDB_LIBSQL_HOST_SUFFIX: libsqlHostSuffix,
    ALLOYDB_DATA_API_HOST_SUFFIX: dataApiHostSuffix,
    LIBSQL_JWT_SIGNING_KEY_PATH: z.string().min(1).optional(),
    // The admin view of the safekeeper layout (what a spread would do).
    ALLOYDB_SAFEKEEPER_COUNT: safekeeperCount,
    ALLOYDB_SAFEKEEPER_STORAGE: safekeeperStorage,
  }),
  z.object({
    ALLOYDB_MODE: z.literal('neon-glue'),
    ...baseShape,
    ...neonShape,
    NEON_PROXY_TO_CONTROLPLANE_TOKEN: required(
      'bearer token the Neon proxy presents on /proxy/*',
    ),
  }),
  z.object({
    ALLOYDB_MODE: z.literal('worker'),
    ...baseShape,
    ...neonShape,
    LIBSQL_JWT_SIGNING_KEY_PATH: required(
      'path of the Ed25519 PKCS#8 PEM that signs libSQL tokens',
    ),
    LIBSQL_ADMIN_AUTH_KEY: required('sqld admin API key'),
    ALLOYDB_LIBSQL_HOST_SUFFIX: libsqlHostSuffix,
    ALLOYDB_SAFEKEEPER_COUNT: safekeeperCount,
    ...platformShape,
    ALLOYDB_IDLE_SWEEP_SECONDS: z.coerce.number().int().min(5).default(30),
    ALLOYDB_REGISTRATION_SECONDS: z.coerce.number().int().min(10).default(60),
  }),
  z.object({
    ALLOYDB_MODE: z.literal('data-api-gateway'),
    ...baseShape,
    ...neonShape,
    ALLOYDB_DATA_API_HOST_SUFFIX: dataApiHostSuffix,
  }),
]);

interface BaseConfig {
  databaseUrl: string;
  port: number;
  /** AES-256 key that seals stored credentials (`ALLOYDB_DATA_KEY`). */
  dataKey: Buffer;
}

interface NeonConfig {
  storageControllerUrl: string;
  neonJwtPrivateKeyPath: string;
  controlPlaneJwtToken: string;
  /** Image of every compute pod (compute_ctl, Postgres and PgBouncer). */
  computeImage: string;
  postgrestImage: string;
  /** Name of the pull Secret on compute pods, or null for none. */
  imagePullSecret: string | null;
  /** Base URL computes fetch their spec from (`compute_ctl --control-plane-uri`). */
  neonGlueUrl: string;
}

export interface ApiConfig extends BaseConfig {
  mode: 'api';
  apiToken: string;
  /** Domain endpoint hosts live under, e.g. `ep-calm-moon-1a2b3c4d.pg.alloydb.net`. */
  pgHostSuffix: string;
  /** libSQL hosts are `<namespace>.<suffix>`. */
  libsqlHostSuffix: string;
  /** Data API hosts are `<endpoint id>.<suffix>`. */
  dataApiHostSuffix: string;
  libsqlJwtSigningKeyPath?: string;
  /** For the admin view of the safekeeper layout. */
  safekeeperCount: number;
  safekeeperStorage: string;
}

export interface NeonGlueConfig extends BaseConfig, NeonConfig {
  mode: 'neon-glue';
  neonProxyToken: string;
}

export interface WorkerConfig extends BaseConfig, NeonConfig {
  mode: 'worker';
  libsqlJwtSigningKeyPath: string;
  libsqlAdminAuthKey: string;
  libsqlHostSuffix: string;
  safekeeperCount: number;
  idleSweepSeconds: number;
  registrationSeconds: number;
  /** Image of the safekeeper pods. */
  neonImage: string;
  safekeeperEntrypointConfigMap: string;
  safekeeperStorage: string;
  autoSpreadSafekeepers: boolean;
  safekeeperMigrateConcurrency: number;
  autoRebalance: boolean;
  rebalanceMaxMoves: number;
  rebalancePrewarm: boolean;
  rebalanceSettleSeconds: number;
}

export interface DataApiGatewayConfig extends BaseConfig, NeonConfig {
  mode: 'data-api-gateway';
  dataApiHostSuffix: string;
}

export type Config =
  | ApiConfig
  | NeonGlueConfig
  | WorkerConfig
  | DataApiGatewayConfig;

type RawEnv = z.infer<typeof envSchema>;

function toConfig(env: RawEnv): Config {
  const base = {
    databaseUrl: env.DATABASE_URL,
    port: env.PORT,
    dataKey: parseDataKey(env.ALLOYDB_DATA_KEY),
  };
  const pullSecret = (value: string) => (value === 'none' ? null : value);
  switch (env.ALLOYDB_MODE) {
    case 'api':
      return {
        ...base,
        mode: 'api',
        apiToken: env.ALLOYDB_API_TOKEN,
        pgHostSuffix: env.ALLOYDB_PG_HOST_SUFFIX,
        libsqlHostSuffix: env.ALLOYDB_LIBSQL_HOST_SUFFIX,
        dataApiHostSuffix: env.ALLOYDB_DATA_API_HOST_SUFFIX,
        libsqlJwtSigningKeyPath: env.LIBSQL_JWT_SIGNING_KEY_PATH,
        safekeeperCount: env.ALLOYDB_SAFEKEEPER_COUNT,
        safekeeperStorage: env.ALLOYDB_SAFEKEEPER_STORAGE,
      };
    case 'neon-glue':
      return {
        ...base,
        mode: 'neon-glue',
        storageControllerUrl: env.STORAGE_CONTROLLER_URL,
        neonJwtPrivateKeyPath: env.NEON_JWT_PRIVATE_KEY_PATH,
        controlPlaneJwtToken: env.CONTROL_PLANE_JWT_TOKEN,
        computeImage: env.ALLOYDB_COMPUTE_IMAGE,
        postgrestImage: env.ALLOYDB_POSTGREST_IMAGE,
        imagePullSecret: pullSecret(env.ALLOYDB_IMAGE_PULL_SECRET),
        neonGlueUrl: env.ALLOYDB_NEON_GLUE_URL,
        neonProxyToken: env.NEON_PROXY_TO_CONTROLPLANE_TOKEN,
      };
    case 'worker':
      return {
        ...base,
        mode: 'worker',
        storageControllerUrl: env.STORAGE_CONTROLLER_URL,
        neonJwtPrivateKeyPath: env.NEON_JWT_PRIVATE_KEY_PATH,
        controlPlaneJwtToken: env.CONTROL_PLANE_JWT_TOKEN,
        computeImage: env.ALLOYDB_COMPUTE_IMAGE,
        postgrestImage: env.ALLOYDB_POSTGREST_IMAGE,
        imagePullSecret: pullSecret(env.ALLOYDB_IMAGE_PULL_SECRET),
        neonGlueUrl: env.ALLOYDB_NEON_GLUE_URL,
        libsqlJwtSigningKeyPath: env.LIBSQL_JWT_SIGNING_KEY_PATH,
        libsqlAdminAuthKey: env.LIBSQL_ADMIN_AUTH_KEY,
        libsqlHostSuffix: env.ALLOYDB_LIBSQL_HOST_SUFFIX,
        safekeeperCount: env.ALLOYDB_SAFEKEEPER_COUNT,
        idleSweepSeconds: env.ALLOYDB_IDLE_SWEEP_SECONDS,
        registrationSeconds: env.ALLOYDB_REGISTRATION_SECONDS,
        neonImage: env.ALLOYDB_NEON_IMAGE,
        safekeeperEntrypointConfigMap:
          env.ALLOYDB_SAFEKEEPER_ENTRYPOINT_CONFIGMAP,
        safekeeperStorage: env.ALLOYDB_SAFEKEEPER_STORAGE,
        autoSpreadSafekeepers: env.ALLOYDB_AUTO_SPREAD_SAFEKEEPERS,
        safekeeperMigrateConcurrency:
          env.ALLOYDB_SAFEKEEPER_MIGRATE_CONCURRENCY,
        autoRebalance: env.ALLOYDB_AUTO_REBALANCE,
        rebalanceMaxMoves: env.ALLOYDB_REBALANCE_MAX_MOVES,
        rebalancePrewarm: env.ALLOYDB_REBALANCE_PREWARM,
        rebalanceSettleSeconds: env.ALLOYDB_REBALANCE_SETTLE_SECONDS,
      };
    case 'data-api-gateway':
      return {
        ...base,
        mode: 'data-api-gateway',
        storageControllerUrl: env.STORAGE_CONTROLLER_URL,
        neonJwtPrivateKeyPath: env.NEON_JWT_PRIVATE_KEY_PATH,
        controlPlaneJwtToken: env.CONTROL_PLANE_JWT_TOKEN,
        computeImage: env.ALLOYDB_COMPUTE_IMAGE,
        postgrestImage: env.ALLOYDB_POSTGREST_IMAGE,
        imagePullSecret: pullSecret(env.ALLOYDB_IMAGE_PULL_SECRET),
        neonGlueUrl: env.ALLOYDB_NEON_GLUE_URL,
        dataApiHostSuffix: env.ALLOYDB_DATA_API_HOST_SUFFIX,
      };
  }
}

/** Empty strings count as unset so `KEY=` in a manifest fails like a missing key. */
function withoutEmptyValues(env: NodeJS.ProcessEnv): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value.trim() !== '') cleaned[key] = value;
  }
  return cleaned;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const cleaned = withoutEmptyValues(env);
  if (!cleaned.ALLOYDB_MODE) {
    throw new ConfigError(
      `Invalid configuration:\n  - ALLOYDB_MODE is required (one of ${MODES.join(', ')})`,
    );
  }
  if (!MODES.includes(cleaned.ALLOYDB_MODE as Mode)) {
    throw new ConfigError(
      `Invalid configuration:\n  - ALLOYDB_MODE=${cleaned.ALLOYDB_MODE} is not valid (one of ${MODES.join(', ')})`,
    );
  }
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || 'env'} ${issue.message}`,
    );
    throw new ConfigError(
      `Invalid configuration for ALLOYDB_MODE=${cleaned.ALLOYDB_MODE}:\n${lines.join('\n')}`,
    );
  }
  return toConfig(parsed.data);
}
