/**
 * AIEO secrets store. Engines must read keys via `getSecret(name)` — never
 * `process.env.*` — so users can rotate keys from the admin UI without
 * redeploys. getSecret falls back to process.env if a row is missing.
 */

import { db, eq, seoSecrets } from "@repo/database";
import { decrypt, encrypt, maskValue } from "./crypto";

export type AieoSecretKey =
  | "PERPLEXITY_API_KEY"
  | "OPENAI_API_KEY"
  | "GEMINI_API_KEY"
  | "ANTHROPIC_API_KEY"
  | "DATAFORSEO_AUTH"
  | "POSTHOG_API_KEY";

export interface MaskedSecret {
  key: AieoSecretKey;
  maskedValue: string;
  lastSetBy: string | null;
  lastSetAt: number;
  lastValidatedAt: number | null;
  lastValidationStatus: string | null;
  lastValidationError: string | null;
}

export async function setSecret(
  key: AieoSecretKey,
  plaintext: string,
  setBy: string,
): Promise<void> {
  const triple = encrypt(plaintext);
  const masked = maskValue(plaintext);
  const now = Math.floor(Date.now() / 1000);

  await db()
    .insert(seoSecrets)
    .values({
      key,
      valueCiphertext: triple.ciphertext,
      valueIv: triple.iv,
      valueAuthTag: triple.authTag,
      maskedValue: masked,
      lastSetBy: setBy,
      lastSetAt: now,
      lastValidatedAt: null,
      lastValidationStatus: null,
      lastValidationError: null,
    })
    .onConflictDoUpdate({
      target: seoSecrets.key,
      set: {
        valueCiphertext: triple.ciphertext,
        valueIv: triple.iv,
        valueAuthTag: triple.authTag,
        maskedValue: masked,
        lastSetBy: setBy,
        lastSetAt: now,
        lastValidatedAt: null,
        lastValidationStatus: null,
        lastValidationError: null,
      },
    });
}

export async function getSecret(key: AieoSecretKey): Promise<string | null> {
  const rows = await db()
    .select()
    .from(seoSecrets)
    .where(eq(seoSecrets.key, key))
    .limit(1);
  const row = rows[0];
  if (!row) {
    const envFallback = process.env[key];
    if (envFallback) {
      console.warn(
        `[aieo-secrets] Falling back to process.env.${key}; migrate by setting it in the backend admin at /seo/aieo/secrets`,
      );
      return envFallback;
    }
    return null;
  }
  try {
    return decrypt({
      ciphertext: row.valueCiphertext,
      iv: row.valueIv,
      authTag: row.valueAuthTag,
    });
  } catch (e) {
    console.error(`[aieo-secrets] Failed to decrypt ${key}:`, e);
    return null;
  }
}

export async function listMaskedSecrets(): Promise<MaskedSecret[]> {
  const rows = await db().select().from(seoSecrets);
  return rows.map((r) => ({
    key: r.key as AieoSecretKey,
    maskedValue: r.maskedValue,
    lastSetBy: r.lastSetBy,
    lastSetAt: r.lastSetAt,
    lastValidatedAt: r.lastValidatedAt,
    lastValidationStatus: r.lastValidationStatus,
    lastValidationError: r.lastValidationError,
  }));
}

export async function recordValidation(
  key: AieoSecretKey,
  status: "ok" | "failed",
  error?: string,
): Promise<void> {
  await db()
    .update(seoSecrets)
    .set({
      lastValidatedAt: Math.floor(Date.now() / 1000),
      lastValidationStatus: status,
      lastValidationError: error ?? null,
    })
    .where(eq(seoSecrets.key, key));
}

export async function deleteSecret(key: AieoSecretKey): Promise<void> {
  await db().delete(seoSecrets).where(eq(seoSecrets.key, key));
}
