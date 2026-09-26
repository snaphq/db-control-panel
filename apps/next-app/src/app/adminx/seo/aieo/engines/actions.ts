"use server";

import { ensureSeoAccess } from "@repo/core/seo-guard";
import { setEngineActive, setEngineModelId } from "@repo/database/dal/seo";
import { revalidatePath } from "next/cache";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export async function toggleEngineAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  await ensureSeoAccess("read_write");
  await setEngineActive(id, isActive);
  revalidatePath("/adminx/seo/aieo/engines");
  revalidatePath("/adminx/seo/aieo");
  return { ok: true };
}

export async function setEngineModelAction(
  formData: FormData,
): Promise<ActionResult> {
  await ensureSeoAccess("read_write");
  const id = String(formData.get("id") ?? "");
  const modelId = String(formData.get("modelId") ?? "").trim() || null;
  if (!id) return { ok: false, message: "Missing engine id" };
  await setEngineModelId(id, modelId);
  revalidatePath("/adminx/seo/aieo/engines");
  return { ok: true };
}
