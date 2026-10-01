import { withProjectControlPlane } from "@repo/core/control-plane/route";

interface RouteParams {
  params: Promise<{ id: string; neonId: string }>;
}

/**
 * DELETE /api/projects/[id]/databases/neon/[neonId]
 * Delete a Postgres project and everything in it. Owners and admins only.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id, neonId } = await params;
  return withProjectControlPlane(id, { write: true, status: 202 }, (cp) =>
    cp.deleteProject(neonId),
  );
}
