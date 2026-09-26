"use server";

import { ensureSeoAccess } from "@repo/core/seo-guard";
import {
  type AieoSecretKey,
  deleteSecret,
  recordValidation,
  setSecret,
} from "@repo/durable-exec";
import { inngest } from "@repo/durable-exec";
import { revalidatePath } from "next/cache";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const VALID_KEYS: AieoSecretKey[] = [
  "PERPLEXITY_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "ANTHROPIC_API_KEY",
  "DATAFORSEO_AUTH",
  "POSTHOG_API_KEY",
];

export async function setSecretAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await ensureSeoAccess("read_write");
  const key = String(formData.get("key") ?? "") as AieoSecretKey;
  const value = String(formData.get("value") ?? "");
  if (!VALID_KEYS.includes(key)) return { ok: false, message: "Invalid key" };
  if (!value) return { ok: false, message: "Value required" };
  try {
    await setSecret(key, value, session?.email ?? "unknown");
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
  revalidatePath("/adminx/seo/aieo/secrets");
  return { ok: true };
}

export async function deleteSecretAction(key: string): Promise<ActionResult> {
  await ensureSeoAccess("read_write");
  if (!VALID_KEYS.includes(key as AieoSecretKey))
    return { ok: false, message: "Invalid key" };
  await deleteSecret(key as AieoSecretKey);
  revalidatePath("/adminx/seo/aieo/secrets");
  return { ok: true };
}

export async function validateAllSecretsAction(): Promise<ActionResult> {
  await ensureSeoAccess("read_write");
  await inngest.send({
    name: "cron/seo-secret-validation",
    data: { triggeredBy: "manual" },
  });
  return { ok: true, message: "Validation queued — refresh in a few seconds" };
}

export async function markValidationFailureAction(
  key: AieoSecretKey,
  error: string,
): Promise<ActionResult> {
  await ensureSeoAccess("read_write");
  await recordValidation(key, "failed", error);
  revalidatePath("/adminx/seo/aieo/secrets");
  return { ok: true };
}
