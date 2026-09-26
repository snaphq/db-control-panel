import { requireSession } from "@repo/core/auth/require-membership";
import { db } from "@repo/database";
import { integration } from "@repo/database/schema";
import { NextResponse } from "next/server";

/**
 * GET /api/integrations
 * List all visible integrations in the registry.
 * Hidden ones (status='hidden' or metadata.hidden=true) are excluded.
 */
export async function GET() {
  await requireSession();

  const rows = await db().select().from(integration);

  const visible = rows.filter((row) => {
    if (row.status === "hidden") return false;
    const meta = row.metadata as { hidden?: boolean } | null;
    if (meta?.hidden) return false;
    return true;
  });

  return NextResponse.json(visible);
}
