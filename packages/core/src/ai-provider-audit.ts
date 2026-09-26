import { db } from "@repo/database";
import { orgAuditLogs } from "@repo/database/schema";
import { nanoid } from "nanoid";

export type AiProviderChangeFields = {
  apiKey?: "set" | "cleared" | "unchanged";
  baseUrl?: "set" | "cleared" | "unchanged";
  defaultModel?: "set" | "cleared" | "unchanged";
};

export async function logOrgAiProviderChange(
  organizationId: string,
  performedByUserId: string,
  changes: AiProviderChangeFields & { action?: string },
) {
  const { action, ...fields } = changes;
  const meaningful = Object.values(fields).some((v) => v && v !== "unchanged");
  if (!meaningful && !action) return;
  await db()
    .insert(orgAuditLogs)
    .values({
      id: nanoid(),
      organizationId,
      action: action ?? "ai_provider_updated",
      metadata: JSON.stringify(fields),
      performedBy: performedByUserId,
    });
}
