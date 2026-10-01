import { withProjectControlPlane } from "@repo/core/control-plane/route";

interface RouteParams {
  params: Promise<{
    id: string;
    neonId: string;
    branchId: string;
    role: string;
  }>;
}

/**
 * POST .../branches/[branchId]/roles/[role]/reset-password
 * Generate a new password for a role. The response carries it once; only a
 * SCRAM secret is stored. Owners and admins only.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const { id, neonId, branchId, role } = await params;
  return withProjectControlPlane(id, { write: true, status: 202 }, (cp) =>
    cp.resetRolePassword(neonId, branchId, role),
  );
}
