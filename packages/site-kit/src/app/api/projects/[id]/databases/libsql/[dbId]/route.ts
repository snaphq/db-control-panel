import { withProjectControlPlane } from "@repo/core/control-plane/route";

interface RouteParams {
  params: Promise<{ id: string; dbId: string }>;
}

/**
 * DELETE /api/projects/[id]/databases/libsql/[dbId]
 * Delete a libSQL database. Owners and admins only.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id, dbId } = await params;
  return withProjectControlPlane(id, { write: true, status: 202 }, (cp) =>
    cp.deleteLibsqlDatabase(dbId),
  );
}
