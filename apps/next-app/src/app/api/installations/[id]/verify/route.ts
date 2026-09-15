import { loadAuthorizedInstallation } from "@/lib/integrations/access";
import { reverifyInstallation } from "@/lib/integrations/install";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/installations/[id]/verify
 */
export async function POST(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const result = await loadAuthorizedInstallation(id, {
    requireWriteRole: true,
  });
  if ("error" in result) return result.error;

  const verify = await reverifyInstallation(
    result.row,
    result.integrationSlug,
    result.tenantId,
  );
  if (!verify.ok) {
    return NextResponse.json(
      { ok: false, error: verify.error },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
