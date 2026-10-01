import { createLibsqlTokenRequestSchema } from "@repo/control-plane-contract";
import { parseJsonBody } from "@repo/core/control-plane/body";
import { withProjectControlPlane } from "@repo/core/control-plane/route";

interface RouteParams {
  params: Promise<{ id: string; dbId: string }>;
}

/**
 * POST /api/projects/[id]/databases/libsql/[dbId]/tokens
 * Issue an access token for a libSQL database. The response carries it once;
 * it is a signed JWT that is not stored. Owners and admins only.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id, dbId } = await params;
  return withProjectControlPlane(id, { write: true }, async (cp) => {
    const body = await parseJsonBody(request, createLibsqlTokenRequestSchema);
    if (!body.ok) return body.response;
    return cp.createLibsqlToken(dbId, body.data);
  });
}
