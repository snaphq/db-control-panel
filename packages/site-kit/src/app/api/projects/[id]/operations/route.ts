import { listOperationsQuerySchema } from "@repo/control-plane-contract";
import { parseSearchParams } from "@repo/core/control-plane/body";
import { withProjectControlPlane } from "@repo/core/control-plane/route";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id]/operations?status=active&limit=&cursor=
 * The project's database operations, newest first. `status=active` lists the
 * ones still `scheduling` or `running`, which the Databases tab follows after
 * a page reload. Any member may read.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  return withProjectControlPlane(id, { write: false }, async (cp) => {
    const query = parseSearchParams(request, listOperationsQuerySchema);
    if (!query.ok) return query.response;
    return cp.listOperations(query.data);
  });
}
