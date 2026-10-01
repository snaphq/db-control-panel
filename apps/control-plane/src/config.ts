import { z } from 'zod';

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
};

const neonShape = {
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
    LIBSQL_JWT_SIGNING_KEY_PATH: z.string().min(1).optional(),
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
  }),
  z.object({
    ALLOYDB_MODE: z.literal('data-api-gateway'),
    ...baseShape,
    NEON_JWT_PRIVATE_KEY_PATH: required(
      'path of the Ed25519 PKCS#8 PEM that signs compute_ctl tokens',
    ),
  }),
]);

interface BaseConfig {
  databaseUrl: string;
  port: number;
}

interface NeonConfig {
  storageControllerUrl: string;
  neonJwtPrivateKeyPath: string;
  controlPlaneJwtToken: string;
}

export interface ApiConfig extends BaseConfig {
  mode: 'api';
  apiToken: string;
  libsqlJwtSigningKeyPath?: string;
}

export interface NeonGlueConfig extends BaseConfig, NeonConfig {
  mode: 'neon-glue';
  neonProxyToken: string;
}

export interface WorkerConfig extends BaseConfig, NeonConfig {
  mode: 'worker';
  libsqlJwtSigningKeyPath: string;
  libsqlAdminAuthKey: string;
}

export interface DataApiGatewayConfig extends BaseConfig {
  mode: 'data-api-gateway';
  neonJwtPrivateKeyPath: string;
}

export type Config =
  | ApiConfig
  | NeonGlueConfig
  | WorkerConfig
  | DataApiGatewayConfig;

type RawEnv = z.infer<typeof envSchema>;

function toConfig(env: RawEnv): Config {
  const base = { databaseUrl: env.DATABASE_URL, port: env.PORT };
  switch (env.ALLOYDB_MODE) {
    case 'api':
      return {
        ...base,
        mode: 'api',
        apiToken: env.ALLOYDB_API_TOKEN,
        libsqlJwtSigningKeyPath: env.LIBSQL_JWT_SIGNING_KEY_PATH,
      };
    case 'neon-glue':
      return {
        ...base,
        mode: 'neon-glue',
        storageControllerUrl: env.STORAGE_CONTROLLER_URL,
        neonJwtPrivateKeyPath: env.NEON_JWT_PRIVATE_KEY_PATH,
        controlPlaneJwtToken: env.CONTROL_PLANE_JWT_TOKEN,
        neonProxyToken: env.NEON_PROXY_TO_CONTROLPLANE_TOKEN,
      };
    case 'worker':
      return {
        ...base,
        mode: 'worker',
        storageControllerUrl: env.STORAGE_CONTROLLER_URL,
        neonJwtPrivateKeyPath: env.NEON_JWT_PRIVATE_KEY_PATH,
        controlPlaneJwtToken: env.CONTROL_PLANE_JWT_TOKEN,
        libsqlJwtSigningKeyPath: env.LIBSQL_JWT_SIGNING_KEY_PATH,
        libsqlAdminAuthKey: env.LIBSQL_ADMIN_AUTH_KEY,
      };
    case 'data-api-gateway':
      return {
        ...base,
        mode: 'data-api-gateway',
        neonJwtPrivateKeyPath: env.NEON_JWT_PRIVATE_KEY_PATH,
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
