import { withProjectControlPlane } from "@repo/core/control-plane/route";

interface RouteParams {
  params: Promise<{ id: string; neonId: string; branchId: string }>;
}

/**
 * DELETE /api/projects/[id]/databases/neon/[neonId]/branches/[branchId]
 * Delete a branch (not the default one, not one with children). Owners and
 * admins only.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id, neonId, branchId } = await params;
  return withProjectControlPlane(id, { write: true, status: 202 }, (cp) =>
    cp.deleteBranch(neonId, branchId),
  );
}
