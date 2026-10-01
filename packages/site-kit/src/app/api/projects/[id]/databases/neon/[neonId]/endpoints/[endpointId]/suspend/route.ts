import { withProjectControlPlane } from "@repo/core/control-plane/route";

interface RouteParams {
  params: Promise<{ id: string; neonId: string; endpointId: string }>;
}

/**
 * POST /api/projects/[id]/databases/neon/[neonId]/endpoints/[endpointId]/suspend
 * Suspend a compute endpoint. Owners and admins only.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const { id, neonId, endpointId } = await params;
  return withProjectControlPlane(id, { write: true, status: 202 }, (cp) =>
    cp.suspendEndpoint(neonId, endpointId),
  );
}
