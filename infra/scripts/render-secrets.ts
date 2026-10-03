#!/usr/bin/env bun
/**
 * Renders the Kubernetes Secrets and ConfigMap the AlloyDB platform needs from
 * the ALLOYDB_* keys of the root .env.local. YAML goes to stdout; pipe it:
 *
 *   bun infra/scripts/render-secrets.ts | kubectl apply -f -
 *
 * Usage: render-secrets.ts [env-file] [--generate-neon-keys] [--generate-libsql-keys]
 *   env-file  defaults to <repo root>/.env.local
 *   --generate-*-keys  create an Ed25519 key pair when the matching
 *                      ALLOYDB_*_JWT_PRIVATE_KEY is empty. The new private key is
 *                      printed to stderr as an env line: save it, otherwise the
 *                      next render mints different tokens.
 *
 * Nothing is written to disk. Keys are base64 of the PKCS#8 PEM so each value
 * is a single line in .env.local.
 *
 * Secret contract (consumed by infra/k8s/*):
 *   cert-manager    cloudflare-api-token  api-token
 *   neon            neon-jwt              public.pem, PAGESERVER_JWT_TOKEN,
 *                                         SAFEKEEPER_JWT_TOKEN, CONTROL_PLANE_JWT_TOKEN,
 *                                         GENERATIONS_API_TOKEN
 *                   neon-s3               AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
 *                                         AWS_REGION, S3_ENDPOINT, S3_BUCKET
 *                   storage-controller-db DATABASE_URL
 *                   neon-proxy-token      NEON_PROXY_TO_CONTROLPLANE_TOKEN
 *   libsql          libsql-s3             LIBSQL_BOTTOMLESS_* and SQLD_META_STORE_*
 *                   libsql-admin          LIBSQL_ADMIN_AUTH_KEY
 *                   libsql-jwt            public.pem
 *   alloydb-system  neon-jwt              as above plus private.pem (signs tenant tokens)
 *                   neon-proxy-token, libsql-admin   as above
 *                   libsql-jwt-signing    private.pem (signs per-database sqld tokens)
 *                   platform-postgres     POSTGRES_PASSWORD
 *                   control-plane-db      DATABASE_URL
 *                   control-plane-data    ALLOYDB_DATA_KEY (AES-256-GCM key that seals stored
 *                                         role passwords and the Data API signing key)
 *                   platform-backup-s3    AWS_*, S3_ENDPOINT, S3_BUCKET
 *                   platform-wal-s3       WAL-G settings for platform-wal/: AWS_*,
 *                                         AWS_ENDPOINT, AWS_S3_FORCE_PATH_STYLE,
 *                                         WALG_S3_PREFIX (s3://<bucket>/platform-wal)
 *   flux-system     alloydb-settings      ConfigMap with ACME_EMAIL
 *
 * Optional keys: ALLOYDB_SQLD_S3_BUCKET and
 * ALLOYDB_PLATFORM_POSTGRES_HOST (host the control plane and storage controller
 * connect to; set it to the restored instance during a recovery, see
 * docs-internal/operations/observability-and-recovery.mdx).
 */
import {
  type KeyObject,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

type Env = Record<string, string>;
type Data = Record<string, string>;

const REQUIRED: Record<string, string> = {
  ALLOYDB_S3_ENDPOINT:
    "S3 API endpoint URL, e.g. https://s3.eu-central-1.example.com",
  ALLOYDB_S3_REGION: "S3 region name",
  ALLOYDB_S3_BUCKET:
    "bucket holding pageserver/, safekeeper/, platform-backups/, platform-wal/",
  ALLOYDB_S3_ACCESS_KEY_ID: "S3 access key id",
  ALLOYDB_S3_SECRET_ACCESS_KEY: "S3 secret access key",
  ALLOYDB_CLOUDFLARE_API_TOKEN:
    "Cloudflare token with Zone:DNS:Edit and Zone:Zone:Read",
  ALLOYDB_ACME_EMAIL: "email for Let's Encrypt account notices",
  ALLOYDB_PLATFORM_POSTGRES_PASSWORD: "generate with: openssl rand -hex 24",
  ALLOYDB_LIBSQL_ADMIN_KEY:
    "sqld admin API key, generate with: openssl rand -hex 32",
  ALLOYDB_NEON_PROXY_TOKEN:
    "proxy to control plane token, generate with: openssl rand -hex 32",
  ALLOYDB_API_TOKEN:
    "console to control-plane API token, generate with: openssl rand -hex 32",
  ALLOYDB_ADMIN_API_TOKEN:
    "admin portal to control-plane admin API token, different from ALLOYDB_API_TOKEN, generate with: openssl rand -hex 32",
  ALLOYDB_DATA_KEY:
    "AES-256 key sealing stored credentials, generate with: openssl rand -base64 32",
};

const scriptDir = dirname(fileURLToPath(import.meta.url));

function fail(message: string): never {
  process.stderr.write(`render-secrets: ${message}\n`);
  process.exit(1);
}

function loadEnv(path: string): Env {
  if (!existsSync(path)) fail(`env file not found: ${path}`);
  const merged: Env = { ...parse(readFileSync(path)) };
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("ALLOYDB_") && value) merged[key] = value;
  }
  return merged;
}

function requireKeys(env: Env): void {
  const missing = Object.entries(REQUIRED).filter(([key]) => !env[key]?.trim());
  if (missing.length === 0) return;
  const lines = missing.map(([key, hint]) => `  ${key}  (${hint})`);
  fail(`missing required keys in the env file:\n${lines.join("\n")}`);
}

/** The api mode refuses to start when the two tokens match, so catch it before it is applied. */
function checkApiTokens(env: Env): void {
  if (env.ALLOYDB_API_TOKEN.trim() === env.ALLOYDB_ADMIN_API_TOKEN.trim()) {
    fail(
      "ALLOYDB_ADMIN_API_TOKEN must differ from ALLOYDB_API_TOKEN (each token unlocks only its own half of the API)",
    );
  }
}

/** The control plane refuses to start on any other length, so catch it before it is applied. */
function checkDataKey(env: Env): void {
  const raw = env.ALLOYDB_DATA_KEY.trim();
  const length = /^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)
    ? Buffer.from(raw, "base64").length
    : -1;
  if (length !== 32) {
    fail(
      "ALLOYDB_DATA_KEY must be base64 of exactly 32 bytes (openssl rand -base64 32)",
    );
  }
}

/** Returns the private key, generating and announcing one when allowed. */
function loadSigningKey(env: Env, name: string, generate: boolean): KeyObject {
  const envKey = `ALLOYDB_${name}_JWT_PRIVATE_KEY`;
  const stored = env[envKey]?.trim();
  if (stored) {
    const pem = Buffer.from(stored, "base64").toString("utf8");
    try {
      const key = createPrivateKey(pem);
      if (key.asymmetricKeyType !== "ed25519") throw new Error("not Ed25519");
      return key;
    } catch (error) {
      fail(`${envKey} is not a base64 PKCS#8 PEM Ed25519 key: ${error}`);
    }
  }
  if (!generate) {
    fail(
      `${envKey} is empty; rerun once with --generate-${name.toLowerCase()}-keys and save the printed line`,
    );
  }
  const { privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  process.stderr.write(
    `render-secrets: generated a new key. Save this line in .env.local:\n${envKey}=${Buffer.from(pem).toString("base64")}\n`,
  );
  return privateKey;
}

const b64url = (input: Buffer | string): string =>
  Buffer.from(input).toString("base64url");

/** EdDSA JWT without exp: Neon disables the exp requirement (libs/utils/src/auth.rs). */
function mintEdDsaJwt(privateKey: KeyObject, claims: object): string {
  const header = b64url(JSON.stringify({ alg: "EdDSA", typ: "JWT" }));
  const payload = b64url(JSON.stringify(claims));
  const signature = sign(null, Buffer.from(`${header}.${payload}`), privateKey);
  return `${header}.${payload}.${b64url(signature)}`;
}

const publicPem = (privateKey: KeyObject): string =>
  createPublicKey(privateKey)
    .export({ type: "spki", format: "pem" })
    .toString();

const privatePem = (privateKey: KeyObject): string =>
  privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const yamlMap = (data: Data): string[] =>
  Object.entries(data).map(
    ([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`,
  );

function resource(
  kind: "Secret" | "ConfigMap",
  name: string,
  namespace: string,
  data: Data,
): string {
  const managed = [
    "  labels:",
    "    app.kubernetes.io/part-of: alloydb",
    "    app.kubernetes.io/managed-by: render-secrets",
  ];
  return [
    "apiVersion: v1",
    `kind: ${kind}`,
    "metadata:",
    `  name: ${name}`,
    `  namespace: ${namespace}`,
    ...managed,
    kind === "Secret" ? "stringData:" : "data:",
    ...yamlMap(data),
  ].join("\n");
}

const secret = (name: string, namespace: string, data: Data): string =>
  resource("Secret", name, namespace, data);

function namespaceDoc(name: string): string {
  return `apiVersion: v1\nkind: Namespace\nmetadata:\n  name: ${name}\n  labels:\n    app.kubernetes.io/part-of: alloydb`;
}

function render(env: Env, neonKey: KeyObject, libsqlKey: KeyObject): string[] {
  const pgPassword = encodeURIComponent(env.ALLOYDB_PLATFORM_POSTGRES_PASSWORD);
  const pgHost =
    env.ALLOYDB_PLATFORM_POSTGRES_HOST?.trim() ||
    "platform-postgres.alloydb-system.svc";
  const dbUrl = (database: string): string =>
    `postgresql://postgres:${pgPassword}@${pgHost}:5432/${database}`;
  const s3 = {
    AWS_ACCESS_KEY_ID: env.ALLOYDB_S3_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: env.ALLOYDB_S3_SECRET_ACCESS_KEY,
    S3_ENDPOINT: env.ALLOYDB_S3_ENDPOINT,
    S3_BUCKET: env.ALLOYDB_S3_BUCKET,
  };
  // sqld has no key prefix: an optional dedicated bucket separates its objects.
  const sqldBucket =
    env.ALLOYDB_SQLD_S3_BUCKET?.trim() || env.ALLOYDB_S3_BUCKET;
  const neonTokens: Data = {
    PAGESERVER_JWT_TOKEN: mintEdDsaJwt(neonKey, { scope: "pageserverapi" }),
    SAFEKEEPER_JWT_TOKEN: mintEdDsaJwt(neonKey, { scope: "safekeeperdata" }),
    CONTROL_PLANE_JWT_TOKEN: mintEdDsaJwt(neonKey, { scope: "admin" }),
    GENERATIONS_API_TOKEN: mintEdDsaJwt(neonKey, { scope: "generations_api" }),
  };
  const neonPublic = { "public.pem": publicPem(neonKey), ...neonTokens };
  const proxyToken = {
    NEON_PROXY_TO_CONTROLPLANE_TOKEN: env.ALLOYDB_NEON_PROXY_TOKEN,
  };
  const libsqlAdmin = { LIBSQL_ADMIN_AUTH_KEY: env.ALLOYDB_LIBSQL_ADMIN_KEY };

  return [
    ...["alloydb-system", "neon", "libsql", "cert-manager"].map(namespaceDoc),
    resource("ConfigMap", "alloydb-settings", "flux-system", {
      ACME_EMAIL: env.ALLOYDB_ACME_EMAIL,
    }),
    secret("cloudflare-api-token", "cert-manager", {
      "api-token": env.ALLOYDB_CLOUDFLARE_API_TOKEN,
    }),
    secret("platform-postgres", "alloydb-system", {
      POSTGRES_PASSWORD: env.ALLOYDB_PLATFORM_POSTGRES_PASSWORD,
    }),
    secret("control-plane-db", "alloydb-system", {
      DATABASE_URL: dbUrl("control_plane"),
    }),
    secret("control-plane-data", "alloydb-system", {
      ALLOYDB_DATA_KEY: env.ALLOYDB_DATA_KEY.trim(),
    }),
    secret("platform-backup-s3", "alloydb-system", {
      ...s3,
      AWS_DEFAULT_REGION: env.ALLOYDB_S3_REGION,
    }),
    // WAL-G reads the standard AWS_* variables; path-style addressing keeps
    // S3-compatible stores that lack virtual-hosted buckets working.
    secret("platform-wal-s3", "alloydb-system", {
      AWS_ACCESS_KEY_ID: s3.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: s3.AWS_SECRET_ACCESS_KEY,
      AWS_REGION: env.ALLOYDB_S3_REGION,
      AWS_ENDPOINT: env.ALLOYDB_S3_ENDPOINT,
      AWS_S3_FORCE_PATH_STYLE: "true",
      WALG_S3_PREFIX: `s3://${env.ALLOYDB_S3_BUCKET}/platform-wal`,
    }),
    secret("neon-jwt", "neon", neonPublic),
    secret("neon-jwt", "alloydb-system", {
      ...neonPublic,
      "private.pem": privatePem(neonKey),
    }),
    secret("neon-s3", "neon", { ...s3, AWS_REGION: env.ALLOYDB_S3_REGION }),
    secret("storage-controller-db", "neon", {
      DATABASE_URL: dbUrl("storage_controller"),
    }),
    secret("neon-proxy-token", "neon", proxyToken),
    secret("neon-proxy-token", "alloydb-system", proxyToken),
    secret("libsql-s3", "libsql", {
      LIBSQL_BOTTOMLESS_ENDPOINT: env.ALLOYDB_S3_ENDPOINT,
      LIBSQL_BOTTOMLESS_BUCKET: sqldBucket,
      LIBSQL_BOTTOMLESS_AWS_ACCESS_KEY_ID: env.ALLOYDB_S3_ACCESS_KEY_ID,
      LIBSQL_BOTTOMLESS_AWS_SECRET_ACCESS_KEY: env.ALLOYDB_S3_SECRET_ACCESS_KEY,
      LIBSQL_BOTTOMLESS_AWS_DEFAULT_REGION: env.ALLOYDB_S3_REGION,
      SQLD_META_STORE_BUCKET_ENDPOINT: env.ALLOYDB_S3_ENDPOINT,
      SQLD_META_STORE_BUCKET_NAME: sqldBucket,
      SQLD_META_STORE_ACCESS_KEY_ID: env.ALLOYDB_S3_ACCESS_KEY_ID,
      SQLD_META_STORE_SECRET_ACCESS: env.ALLOYDB_S3_SECRET_ACCESS_KEY,
      SQLD_META_STORE_REGION: env.ALLOYDB_S3_REGION,
    }),
    secret("libsql-admin", "libsql", libsqlAdmin),
    secret("libsql-admin", "alloydb-system", libsqlAdmin),
    secret("libsql-jwt", "libsql", { "public.pem": publicPem(libsqlKey) }),
    secret("libsql-jwt-signing", "alloydb-system", {
      "private.pem": privatePem(libsqlKey),
    }),
    secret("control-plane-api", "alloydb-system", {
      ALLOYDB_API_TOKEN: env.ALLOYDB_API_TOKEN,
      ALLOYDB_ADMIN_API_TOKEN: env.ALLOYDB_ADMIN_API_TOKEN,
    }),
  ];
}

function main(): void {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((arg) => arg.startsWith("--")));
  const unknown = [...flags].filter(
    (flag) =>
      flag !== "--generate-neon-keys" && flag !== "--generate-libsql-keys",
  );
  if (unknown.length > 0) fail(`unknown option(s): ${unknown.join(", ")}`);
  const envPath = resolve(
    args.find((arg) => !arg.startsWith("--")) ??
      resolve(scriptDir, "../../.env.local"),
  );

  const env = loadEnv(envPath);
  requireKeys(env);
  checkDataKey(env);
  checkApiTokens(env);
  const neonKey = loadSigningKey(
    env,
    "NEON",
    flags.has("--generate-neon-keys"),
  );
  const libsqlKey = loadSigningKey(
    env,
    "LIBSQL",
    flags.has("--generate-libsql-keys"),
  );
  process.stdout.write(`${render(env, neonKey, libsqlKey).join("\n---\n")}\n`);
}

main();
