"use server";

import { ensureSeoAccess } from "@repo/core/seo-guard";
import { type AieoSettingKey, setSetting } from "@repo/durable-exec";
import { revalidatePath } from "next/cache";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export async function setSettingAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await ensureSeoAccess("read_write");
  const key = String(formData.get("key") ?? "") as AieoSettingKey;
  const raw = String(formData.get("value") ?? "");
  const type = String(formData.get("type") ?? "string");

  let parsed: unknown;
  try {
    if (type === "number") parsed = Number(raw);
    else if (type === "json" || type === "array") parsed = JSON.parse(raw);
    else parsed = raw;
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Invalid input",
    };
  }

  if (
    type === "number" &&
    (typeof parsed !== "number" || Number.isNaN(parsed))
  ) {
    return { ok: false, message: "Value must be a number" };
  }

  await setSetting(key, parsed, session?.email ?? "unknown");
  revalidatePath("/adminx/seo/aieo/settings");
  revalidatePath("/adminx/seo/aieo");
  return { ok: true };
}
