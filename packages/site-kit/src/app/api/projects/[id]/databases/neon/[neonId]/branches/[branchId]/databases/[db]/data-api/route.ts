import { withProjectControlPlane } from "@repo/core/control-plane/route";

interface RouteParams {
  params: Promise<{
    id: string;
    neonId: string;
    branchId: string;
    db: string;
  }>;
}

/** PUT .../databases/[db]/data-api: enable the Data API. Owners and admins only. */
export async function PUT(_request: Request, { params }: RouteParams) {
  const { id, neonId, branchId, db } = await params;
  return withProjectControlPlane(id, { write: true, status: 202 }, (cp) =>
    cp.setDataApi(neonId, branchId, db, true),
  );
}

/** DELETE .../databases/[db]/data-api: disable the Data API. Owners and admins only. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id, neonId, branchId, db } = await params;
  return withProjectControlPlane(id, { write: true, status: 202 }, (cp) =>
    cp.setDataApi(neonId, branchId, db, false),
  );
}
