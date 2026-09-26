import { db } from "@repo/database";
import { orgAuditLogs, userAuditLogs } from "@repo/database/schema";
import { nanoid } from "nanoid";

export type AiProviderChangeFields = {
  apiKey?: "set" | "cleared" | "unchanged";
  baseUrl?: "set" | "cleared" | "unchanged";
  defaultModel?: "set" | "cleared" | "unchanged";
};

export async function logAdminAiProviderChange(
  performedByUserId: string,
  changes: AiProviderChangeFields,
) {
  const meaningful = Object.values(changes).some((v) => v && v !== "unchanged");
  if (!meaningful) return;
  await db()
    .insert(userAuditLogs)
    .values({
      id: nanoid(),
      userId: performedByUserId,
      action: "admin_ai_provider_updated",
      metadata: JSON.stringify(changes),
    });
}

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
