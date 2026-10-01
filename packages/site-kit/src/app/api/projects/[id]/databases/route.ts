import { loadDatabasesOverview } from "@repo/core/control-plane/overview";
import { withProjectControlPlane } from "@repo/core/control-plane/route";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id]/databases
 * Postgres projects (branches, endpoints, roles, databases) and libSQL
 * databases of this project. Any member of the workspace may read.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  return withProjectControlPlane(id, { write: false }, (cp) =>
    loadDatabasesOverview(cp),
  );
}
