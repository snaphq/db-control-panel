import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getSiteUrl } from "@/lib/site-config";
import { db, eq } from "@repo/database";
import { agentToken } from "@repo/database/schema-agent-auth";
import {
  SignJWT,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  importJWK,
  importPKCS8,
} from "jose";

export const IDENTITY_ASSERTION_TTL_DAYS = Number(
  process.env.AGENT_AUTH_ASSERTION_TTL_DAYS ?? 30,
);
export const ACCESS_TOKEN_TTL_SECONDS = Number(
  process.env.AGENT_AUTH_ACCESS_TOKEN_TTL ?? 3600,
);

let cachedKeyPair: Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  kid: string;
}> | null = null;

/** A deterministic configuration failure that callers can map to HTTP 503. */
export class AgentAuthConfigurationError extends Error {
  readonly code = "AGENT_AUTH_KEY_UNAVAILABLE";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AgentAuthConfigurationError";
  }
}

async function loadPrivateKeyPem(): Promise<string | null> {
  const value = process.env.AGENT_AUTH_PRIVATE_KEY;
  // Deployment secret stores often expose multiline PEM values with literal
  // `\\n` escapes. Normalize that representation before jose parses it while
  // leaving ordinary PEM newlines unchanged.
  return value ? value.replace(/\\n/g, "\n") : null;
}

async function createKeyPair(): Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  kid: string;
}> {
  const pem = await loadPrivateKeyPem();
  if (pem) {
    let privateKey: CryptoKey;
    try {
      privateKey = await importPKCS8(pem, "ES256", { extractable: true });
    } catch (error) {
      throw new AgentAuthConfigurationError(
        "AGENT_AUTH_PRIVATE_KEY is not a valid ES256 private key",
        { cause: error },
      );
    }
    // jose deliberately rejects a private CryptoKey for verification. Derive
    // an extractable public key once at startup so signing and verification
    // always use the appropriate half of the pair.
    const { d: _privateScalar, ...publicJwk } = await exportJWK(privateKey);
    const publicKey = (await importJWK(publicJwk, "ES256")) as CryptoKey;
    return {
      privateKey,
      publicKey,
      kid: process.env.AGENT_AUTH_KEY_ID ?? "agent-auth-1",
    };
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.AGENT_AUTH_ENABLED !== "false"
  ) {
    throw new AgentAuthConfigurationError(
      "AGENT_AUTH_PRIVATE_KEY is required in production (generate with: openssl ecparam -name prime256v1 -genkey -noout -out private.pem)",
    );
  }

  // Dev-only ephemeral key so the flow works without setup.
  if (!process.env.AGENT_AUTH_PRIVATE_KEY) {
    console.warn(
      "[agent-auth] AGENT_AUTH_PRIVATE_KEY not set — using an ephemeral dev key. Tokens will not survive restarts.",
    );
  }
  const { privateKey, publicKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  return { privateKey, publicKey, kid: "agent-auth-dev" };
}

export function getSigningKey(): Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  kid: string;
}> {
  if (!cachedKeyPair) {
    cachedKeyPair = createKeyPair().catch((err) => {
      cachedKeyPair = null;
      throw err;
    });
  }
  return cachedKeyPair;
}

export async function exportPublicKeyJwks(): Promise<{
  keys: Array<Record<string, unknown>>;
}> {
  const { publicKey, kid } = await getSigningKey();
  const publicJwk = await exportJWK(publicKey);
  return {
    keys: [{ ...publicJwk, kid, use: "sig", alg: "ES256" }],
  };
}

export async function exportPrivateKeyPem(): Promise<string> {
  const { privateKey } = await getSigningKey();
  return exportPKCS8(privateKey);
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Mint the service-signed identity_assertion (typ oauth-id-jag+jwt, sub = registration id). */
export async function signIdentityAssertion(params: {
  registrationId: string;
  scopes: string;
  registrationType: string;
  resource: string;
  issuer?: string;
  email?: string | null;
  emailVerified?: boolean;
}): Promise<{ jwt: string; expiresAt: Date; jti: string }> {
  const { privateKey, kid } = await getSigningKey();
  const issuer = params.issuer ?? getSiteUrl();
  const exp = new Date(
    Date.now() + IDENTITY_ASSERTION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  const jti = randomUUID();

  const jwt = await new SignJWT({
    registration_type: params.registrationType,
    scope: params.scopes,
    ...(params.email
      ? { email: params.email, email_verified: params.emailVerified ?? true }
      : {}),
  })
    .setProtectedHeader({ alg: "ES256", typ: "oauth-id-jag+jwt", kid })
    .setIssuer(issuer)
    .setAudience(params.resource)
    .setSubject(params.registrationId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(Math.floor(exp.getTime() / 1000))
    .sign(privateKey);

  return { jwt, expiresAt: exp, jti };
}

/** Mint a bearer access token for a registration (scope is resolved by the caller). */
export async function signAccessToken(params: {
  registrationId: string;
  scope: string;
  tenantId: string;
  resource: string;
  issuer?: string;
}): Promise<{ jwt: string; expiresIn: number; jti: string; expiresAt: Date }> {
  const { privateKey, kid } = await getSigningKey();
  const issuer = params.issuer ?? getSiteUrl();
  const expiresIn = ACCESS_TOKEN_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  const jti = randomUUID();

  const jwt = await new SignJWT({
    scope: params.scope,
    tid: params.tenantId,
  })
    .setProtectedHeader({ alg: "ES256", typ: "at+jwt", kid })
    .setIssuer(issuer)
    .setAudience(params.resource)
    .setSubject(params.registrationId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(privateKey);

  return { jwt, expiresIn, jti, expiresAt };
}

export async function recordIssuedToken(params: {
  tenantId: string;
  registrationId: string;
  jti: string;
  scope: string;
  resource: string;
  expiresAt: Date;
}): Promise<void> {
  await db()
    .insert(agentToken)
    .values({
      id: `agt_${crypto.randomUUID()}`,
      tenantId: params.tenantId,
      registrationId: params.registrationId,
      jti: params.jti,
      scope: params.scope,
      resource: params.resource,
      expiresAt: params.expiresAt,
    });
}

export async function isTokenRevoked(jti: string): Promise<boolean> {
  const [row] = await db()
    .select({ revokedAt: agentToken.revokedAt })
    .from(agentToken)
    .where(eq(agentToken.jti, jti))
    .limit(1);
  return !row || row.revokedAt !== null;
}
