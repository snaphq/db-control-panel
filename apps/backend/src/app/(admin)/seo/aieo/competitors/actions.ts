"use server";

import { ensureSeoAccess } from "@/lib/seo-guard";
import {
  setCompetitorExcluded,
  setCompetitorPinned,
} from "@repo/database/dal/seo";
import { inngest } from "@repo/durable-exec";
import { revalidatePath } from "next/cache";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export async function pinCompetitorAction(
  id: string,
  pin: boolean,
): Promise<ActionResult> {
  await ensureSeoAccess("read_write");
  await setCompetitorPinned(id, pin);
  revalidatePath("/seo/aieo/competitors");
  return { ok: true };
}

export async function excludeCompetitorAction(
  id: string,
  exclude: boolean,
): Promise<ActionResult> {
  await ensureSeoAccess("read_write");
  await setCompetitorExcluded(id, exclude);
  revalidatePath("/seo/aieo/competitors");
  return { ok: true };
}

export async function reinferCompetitorsAction(): Promise<ActionResult> {
  await ensureSeoAccess("read_write");
  await inngest.send({
    name: "cron/seo-competitor-rollup",
    data: { triggeredBy: "manual" },
  });
  return {
    ok: true,
    message: "Re-inference queued — refresh in a few seconds",
  };
}
