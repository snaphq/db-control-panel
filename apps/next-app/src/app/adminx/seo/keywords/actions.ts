"use server";

import { ensureSeoAccess } from "@repo/core/seo-guard";
import {
  archiveKeyword,
  createKeyword,
  getKeywordByText,
  updateKeyword,
} from "@repo/database/dal/seo";
import { inngest } from "@repo/durable-exec";
import { revalidatePath } from "next/cache";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export async function createKeywordAction(
  formData: FormData,
): Promise<ActionResult> {
  await ensureSeoAccess("read_write");

  const keyword = String(formData.get("keyword") ?? "").trim();
  if (!keyword) return { ok: false, message: "Keyword is required" };

  const existing = await getKeywordByText(keyword);
  if (existing) return { ok: false, message: "Keyword already exists" };

  const cluster = String(formData.get("cluster") ?? "").trim() || null;
  const intent = String(formData.get("intent") ?? "").trim() || null;
  const targetPath = String(formData.get("targetPath") ?? "").trim() || null;
  const priority =
    String(formData.get("priority") ?? "medium").trim() || "medium";
  const searchVolumeRaw = String(formData.get("searchVolume") ?? "").trim();
  const searchVolume = searchVolumeRaw
    ? Number.parseInt(searchVolumeRaw, 10)
    : null;
  const difficulty = String(formData.get("difficulty") ?? "").trim() || null;

  await createKeyword({
    keyword,
    cluster,
    intent,
    targetPath,
    priority,
    searchVolume:
      searchVolume !== null && Number.isFinite(searchVolume)
        ? searchVolume
        : null,
    difficulty,
  });

  revalidatePath("/adminx/seo");
  revalidatePath("/adminx/seo/keywords");
  return { ok: true };
}

export async function toggleKeywordActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  await ensureSeoAccess("read_write");
  await updateKeyword(id, { isActive });
  revalidatePath("/adminx/seo");
  revalidatePath("/adminx/seo/keywords");
  return { ok: true };
}

export async function archiveKeywordAction(id: string): Promise<ActionResult> {
  await ensureSeoAccess("read_write");
  await archiveKeyword(id);
  revalidatePath("/adminx/seo");
  revalidatePath("/adminx/seo/keywords");
  return { ok: true };
}

export async function snapshotKeywordNowAction(
  id: string,
): Promise<ActionResult> {
  await ensureSeoAccess("read_write");
  await inngest.send({
    name: "cron/seo-rank-snapshot",
    data: { triggeredBy: "manual", keywordId: id },
  });
  return { ok: true, message: "Snapshot queued" };
}
