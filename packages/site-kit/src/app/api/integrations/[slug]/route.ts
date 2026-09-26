import { requireSession } from "@repo/core/auth/require-membership";
import { db, eq } from "@repo/database";
import { integration } from "@repo/database/schema";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/**
 * GET /api/integrations/[slug]
 */
export async function GET(_request: Request, { params }: RouteParams) {
  await requireSession();
  const { slug } = await params;

  const [row] = await db()
    .select()
    .from(integration)
    .where(eq(integration.slug, slug))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}
