import { createBranchRequestSchema } from "@repo/control-plane-contract";
import { parseJsonBody } from "@repo/core/control-plane/body";
import { withProjectControlPlane } from "@repo/core/control-plane/route";

interface RouteParams {
  params: Promise<{ id: string; neonId: string }>;
}

/**
 * POST /api/projects/[id]/databases/neon/[neonId]/branches
 * Fork a branch, from now or from a given LSN. Owners and admins only.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id, neonId } = await params;
  return withProjectControlPlane(
    id,
    { write: true, status: 202 },
    async (cp) => {
      const body = await parseJsonBody(request, createBranchRequestSchema);
      if (!body.ok) return body.response;
      return cp.createBranch(neonId, body.data);
    },
  );
}
