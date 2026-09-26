import { db, eq, inArray, orgAiProvider } from "@repo/database";
import { appSettings } from "@repo/database/schema";
import { decrypt, encrypt } from "./integrations/encryption";

export const OPENAI_SETTING_KEYS = {
  BASE_URL: "openai_base_url",
  API_KEY: "openai_api_key",
  DEFAULT_MODEL: "openai_default_model",
} as const;

export type OpenAIConfig = {
  baseUrl: string | null;
  apiKey: string;
  defaultModel: string | null;
  source: "org" | "global";
};

export type OpenAIConfigMasked = {
  baseUrl: string | null;
  apiKeyLast4: string | null;
  hasApiKey: boolean;
  defaultModel: string | null;
};

export type OrgOpenAIConfigMasked = OpenAIConfigMasked & {
  /** True when at least one field is overridden at the org level. */
  hasOrgOverride: boolean;
};

async function readGlobalSettings(): Promise<Partial<Record<string, string>>> {
  const rows = await db()
    .select()
    .from(appSettings)
    .where(
      inArray(appSettings.key, [
        OPENAI_SETTING_KEYS.BASE_URL,
        OPENAI_SETTING_KEYS.API_KEY,
        OPENAI_SETTING_KEYS.DEFAULT_MODEL,
      ]),
    );
  const out: Partial<Record<string, string>> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

async function readOrgOverride(organizationId: string) {
  const [row] = await db()
    .select()
    .from(orgAiProvider)
    .where(eq(orgAiProvider.organizationId, organizationId))
    .limit(1);
  return row ?? null;
}

/**
 * Returns the decrypted OpenAI config for runtime use.
 *
 * When `organizationId` is passed and an `org_ai_provider` row exists, its
 * non-null fields override the global admin config. If the org row supplies
 * its own encrypted API key, that key is used; otherwise the global key is
 * used and the org row only overrides base URL / default model.
 */
export async function getOpenAIConfig(
  organizationId?: string,
): Promise<OpenAIConfig> {
  const global = await readGlobalSettings();
  const globalKey = global[OPENAI_SETTING_KEYS.API_KEY] ?? null;
  const globalBase = global[OPENAI_SETTING_KEYS.BASE_URL] ?? null;
  const globalModel = global[OPENAI_SETTING_KEYS.DEFAULT_MODEL] ?? null;

  const orgRow = organizationId ? await readOrgOverride(organizationId) : null;

  const encryptedKey = orgRow?.apiKeyEncrypted ?? globalKey;
  if (!encryptedKey) {
    throw new Error(
      "OpenAI API key has not been configured. Set it in /adminx/ai-provider or workspace AI settings.",
    );
  }

  const usedOrgKey = Boolean(orgRow?.apiKeyEncrypted);
  const usedOrgBase = Boolean(orgRow?.baseUrl);
  const usedOrgModel = Boolean(orgRow?.defaultModel);

  return {
    baseUrl: orgRow?.baseUrl ?? globalBase,
    apiKey: decrypt(encryptedKey),
    defaultModel: orgRow?.defaultModel ?? globalModel,
    source: usedOrgKey || usedOrgBase || usedOrgModel ? "org" : "global",
  };
}

/**
 * Returns a masked version of the global config safe to send to the admin UI.
 */
export async function getOpenAIConfigMasked(): Promise<OpenAIConfigMasked> {
  const values = await readGlobalSettings();
  const encryptedKey = values[OPENAI_SETTING_KEYS.API_KEY];
  let apiKeyLast4: string | null = null;
  if (encryptedKey) {
    try {
      const plain = decrypt(encryptedKey);
      apiKeyLast4 = plain.length >= 4 ? plain.slice(-4) : plain;
    } catch {
      apiKeyLast4 = null;
    }
  }
  return {
    baseUrl: values[OPENAI_SETTING_KEYS.BASE_URL] ?? null,
    apiKeyLast4,
    hasApiKey: Boolean(encryptedKey),
    defaultModel: values[OPENAI_SETTING_KEYS.DEFAULT_MODEL] ?? null,
  };
}

/**
 * Returns the masked org-level override config (for workspace settings UI).
 */
export async function getOrgOpenAIConfigMasked(
  organizationId: string,
): Promise<OrgOpenAIConfigMasked> {
  const row = await readOrgOverride(organizationId);
  if (!row) {
    return {
      baseUrl: null,
      apiKeyLast4: null,
      hasApiKey: false,
      defaultModel: null,
      hasOrgOverride: false,
    };
  }
  let apiKeyLast4: string | null = null;
  if (row.apiKeyEncrypted) {
    try {
      const plain = decrypt(row.apiKeyEncrypted);
      apiKeyLast4 = plain.length >= 4 ? plain.slice(-4) : plain;
    } catch {
      apiKeyLast4 = null;
    }
  }
  return {
    baseUrl: row.baseUrl,
    apiKeyLast4,
    hasApiKey: Boolean(row.apiKeyEncrypted),
    defaultModel: row.defaultModel,
    hasOrgOverride: Boolean(
      row.apiKeyEncrypted || row.baseUrl || row.defaultModel,
    ),
  };
}

export function encryptOpenAIApiKey(plaintext: string): string {
  return encrypt(plaintext);
}

export async function clearOpenAIApiKey(): Promise<void> {
  await db()
    .delete(appSettings)
    .where(eq(appSettings.key, OPENAI_SETTING_KEYS.API_KEY));
}

type OrgUpsertInput = {
  organizationId: string;
  updatedBy: string;
  baseUrl?: string | null;
  defaultModel?: string | null;
  /** Plaintext key; will be encrypted. Pass `null` to clear, `undefined` to leave unchanged. */
  apiKey?: string | null | undefined;
};

/**
 * Upsert the per-org AI provider override.
 */
export async function upsertOrgOpenAIConfig(
  input: OrgUpsertInput,
): Promise<void> {
  const existing = await readOrgOverride(input.organizationId);
  const nextBase =
    input.baseUrl === undefined ? (existing?.baseUrl ?? null) : input.baseUrl;
  const nextModel =
    input.defaultModel === undefined
      ? (existing?.defaultModel ?? null)
      : input.defaultModel;
  let nextEncryptedKey = existing?.apiKeyEncrypted ?? null;
  if (input.apiKey === null) {
    nextEncryptedKey = null;
  } else if (typeof input.apiKey === "string" && input.apiKey.trim()) {
    nextEncryptedKey = encrypt(input.apiKey.trim());
  }

  if (existing) {
    await db()
      .update(orgAiProvider)
      .set({
        baseUrl: nextBase,
        defaultModel: nextModel,
        apiKeyEncrypted: nextEncryptedKey,
        updatedBy: input.updatedBy,
      })
      .where(eq(orgAiProvider.organizationId, input.organizationId));
  } else {
    await db().insert(orgAiProvider).values({
      organizationId: input.organizationId,
      baseUrl: nextBase,
      defaultModel: nextModel,
      apiKeyEncrypted: nextEncryptedKey,
      updatedBy: input.updatedBy,
    });
  }
}

export async function deleteOrgOpenAIConfig(
  organizationId: string,
): Promise<void> {
  await db()
    .delete(orgAiProvider)
    .where(eq(orgAiProvider.organizationId, organizationId));
}
