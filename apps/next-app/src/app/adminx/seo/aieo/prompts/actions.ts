"use server";

import { ensureSeoAccess } from "@repo/core/seo-guard";
import {
  archivePrompt,
  createPrompt,
  updatePrompt,
} from "@repo/database/dal/seo";
import { inngest } from "@repo/durable-exec";
import { revalidatePath } from "next/cache";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export async function createPromptAction(
  formData: FormData,
): Promise<ActionResult> {
  await ensureSeoAccess("read_write");
  const prompt = String(formData.get("prompt") ?? "").trim();
  if (!prompt) return { ok: false, message: "Prompt required" };
  const intent = String(formData.get("intent") ?? "").trim() || null;
  const cluster = String(formData.get("cluster") ?? "").trim() || null;
  const priority =
    String(formData.get("priority") ?? "medium").trim() || "medium";
  const targetPath = String(formData.get("targetPath") ?? "").trim() || null;

  try {
    await createPrompt({ prompt, intent, cluster, priority, targetPath });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
  revalidatePath("/adminx/seo/aieo");
  revalidatePath("/adminx/seo/aieo/prompts");
  return { ok: true };
}

export async function togglePromptActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  await ensureSeoAccess("read_write");
  await updatePrompt(id, { isActive });
  revalidatePath("/adminx/seo/aieo/prompts");
  return { ok: true };
}

export async function archivePromptAction(id: string): Promise<ActionResult> {
  await ensureSeoAccess("read_write");
  await archivePrompt(id);
  revalidatePath("/adminx/seo/aieo/prompts");
  return { ok: true };
}

export async function snapshotPromptNowAction(
  id: string,
): Promise<ActionResult> {
  await ensureSeoAccess("read_write");
  await inngest.send({
    name: "cron/seo-prompt-snapshot",
    data: { triggeredBy: "manual", promptId: id },
  });
  return { ok: true, message: "Snapshot queued" };
}

export async function snapshotAllPromptsNowAction(): Promise<ActionResult> {
  await ensureSeoAccess("read_write");
  await inngest.send({
    name: "cron/seo-prompt-snapshot",
    data: { triggeredBy: "manual" },
  });
  return { ok: true, message: "Full snapshot run queued" };
}
