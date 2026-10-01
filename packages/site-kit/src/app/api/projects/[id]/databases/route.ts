import { createProjectRequestSchema } from "@repo/control-plane-contract";
import { parseJsonBody } from "@repo/core/control-plane/body";
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

/**
 * POST /api/projects/[id]/databases
 * Create the project's Postgres project. The response carries the owner
 * role's password and connection URI; they are shown once and never stored.
 * Owners and admins only.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  return withProjectControlPlane(
    id,
    { write: true, status: 202 },
    async (cp) => {
      const body = await parseJsonBody(request, createProjectRequestSchema);
      if (!body.ok) return body.response;
      return cp.createProject(body.data);
    },
  );
}
