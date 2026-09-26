/**
 * AES-256-GCM encryption for integration secrets.
 *
 * Key source: process.env.INTEGRATION_ENCRYPTION_KEY
 * Required format: 32 bytes hex (64 hex chars).
 * Generate with: openssl rand -hex 32
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_BYTES = 32;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY is not set. Generate with `openssl rand -hex 32` and add to .env.local.",
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY must be 32 bytes hex (64 hex chars).",
    );
  }
  const key = Buffer.from(raw, "hex");
  if (key.length !== KEY_BYTES) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY must decode to 32 bytes.");
  }
  cachedKey = key;
  return key;
}

/**
 * Encrypts a UTF-8 string. Returns base64-encoded `iv:authTag:ciphertext`.
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Decrypts a token produced by `encrypt`.
 */
export function decrypt(token: string): string {
  const parts = token.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format.");
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString("utf8");
}

/**
 * Encrypts a JSON-serializable value.
 */
export function encryptJson(value: unknown): string {
  return encrypt(JSON.stringify(value));
}

/**
 * Decrypts and parses a JSON value.
 */
export function decryptJson<T = unknown>(token: string): T {
  return JSON.parse(decrypt(token)) as T;
}
