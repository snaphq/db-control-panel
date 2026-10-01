import { createLibsqlDatabaseRequestSchema } from "@repo/control-plane-contract";
import { parseJsonBody } from "@repo/core/control-plane/body";
import { withProjectControlPlane } from "@repo/core/control-plane/route";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/projects/[id]/databases/libsql
 * Create a libSQL database. Owners and admins only.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  return withProjectControlPlane(
    id,
    { write: true, status: 202 },
    async (cp) => {
      const body = await parseJsonBody(
        request,
        createLibsqlDatabaseRequestSchema,
      );
      if (!body.ok) return body.response;
      return cp.createLibsqlDatabase(body.data);
    },
  );
}
