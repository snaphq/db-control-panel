import "server-only";

import { db, eq } from "@repo/database";
import { adminAuditLog, adminUser } from "@repo/database/schema-admin";
import { nanoid } from "nanoid";

type AdminActor = { id: string } | { email: string };

/** Record an admin portal action in `admin_audit_log`. */
export async function logAdminAction(
  actor: AdminActor,
  action: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  let adminUserId: string | null = "id" in actor ? actor.id : null;
  if (!adminUserId && "email" in actor) {
    const [row] = await db()
      .select({ id: adminUser.id })
      .from(adminUser)
      .where(eq(adminUser.email, actor.email))
      .limit(1);
    adminUserId = row?.id ?? null;
  }
  await db()
    .insert(adminAuditLog)
    .values({
      id: nanoid(),
      adminUserId,
      action,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
}
