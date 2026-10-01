import { withProjectControlPlane } from "@repo/core/control-plane/route";

interface RouteParams {
  params: Promise<{ id: string; opId: string }>;
}

/**
 * GET /api/projects/[id]/operations/[opId]
 * Progress of a long database operation; the Databases tab polls it until the
 * operation is finished, failed or cancelled. Any member may read.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id, opId } = await params;
  return withProjectControlPlane(id, { write: false }, (cp) =>
    cp.getOperation(opId),
  );
}
