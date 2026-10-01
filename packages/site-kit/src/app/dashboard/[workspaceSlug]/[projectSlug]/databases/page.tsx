import { requireProjectMembership } from "@repo/core/auth/require-membership";
import { canManageDatabases } from "@repo/core/control-plane/access";
import { controlPlaneFor } from "@repo/core/control-plane/client";
import {
  ControlPlaneError,
  describeControlPlaneError,
} from "@repo/core/control-plane/errors";
import { loadDatabasesOverview } from "@repo/core/control-plane/overview";
import { DatabasesPanel } from "@repo/react-ui/components/databases/databases-panel";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/react-ui/components/ui/alert";

interface PageProps {
  params: Promise<{ workspaceSlug: string; projectSlug: string }>;
}

export const dynamic = "force-dynamic";

export default async function ProjectDatabasesPage({ params }: PageProps) {
  const { workspaceSlug, projectSlug } = await params;
  const { project, organization, membership } = await requireProjectMembership(
    workspaceSlug,
    projectSlug,
    `/dashboard/${workspaceSlug}/${projectSlug}/databases`,
  );

  // The organization and project come from the membership check above.
  let overview: Awaited<ReturnType<typeof loadDatabasesOverview>> | null = null;
  let failure: string | null = null;
  try {
    overview = await loadDatabasesOverview(
      controlPlaneFor({
        organizationId: organization.id,
        projectId: project.id,
      }),
    );
  } catch (error) {
    if (!(error instanceof ControlPlaneError)) throw error;
    console.error("Loading databases failed:", error.message);
    failure = describeControlPlaneError(error);
  }

  return (
    <div className="flex flex-col gap-6 px-4 pt-5 pb-20">
      <div>
        <h2 className="font-semibold text-3xl tracking-tight">Databases</h2>
        <p className="text-muted-foreground mt-1">
          Postgres and libSQL databases for the{" "}
          <span className="font-medium text-foreground">{project.name}</span>{" "}
          project.
        </p>
      </div>

      {overview ? (
        <DatabasesPanel
          projectId={project.id}
          initial={overview}
          canManage={canManageDatabases(membership.role)}
        />
      ) : (
        <Alert variant="destructive">
          <AlertTitle>Databases are unavailable</AlertTitle>
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
