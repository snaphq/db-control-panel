import { requireProjectMembership } from "@repo/core/auth/require-membership";
import {
  findInstallationById,
  findIntegrationBySlug,
} from "@repo/core/integrations/queries";
import { toSafeInstallation } from "@repo/core/integrations/types";
import { InstallationManager } from "@repo/react-ui/components/integrations/installation-manager";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{
    workspaceSlug: string;
    projectSlug: string;
    integrationSlug: string;
    installationId: string;
  }>;
}

export default async function ManageInstallationPage({ params }: PageProps) {
  const { workspaceSlug, projectSlug, integrationSlug, installationId } =
    await params;
  const { organization, project } = await requireProjectMembership(
    workspaceSlug,
    projectSlug,
    `/dashboard/${workspaceSlug}/${projectSlug}/integrations/${integrationSlug}/${installationId}`,
  );

  const [intg, install] = await Promise.all([
    findIntegrationBySlug(integrationSlug),
    findInstallationById(installationId, {
      tenantId: organization.tenantId,
      organizationId: organization.id,
      projectId: project.id,
    }),
  ]);

  if (!intg || !install) notFound();
  if (install.organizationId !== organization.id) notFound();
  if (install.integrationId !== intg.id) notFound();

  const baseHref = `/dashboard/${workspaceSlug}/${projectSlug}/integrations`;

  return (
    <div className="flex flex-col gap-6 px-4 pt-5 pb-20">
      <div>
        <h2 className="font-semibold text-3xl tracking-tight">
          {install.displayName ?? intg.name}
        </h2>
        <p className="text-muted-foreground mt-1">
          {intg.name} ·{" "}
          {install.projectId
            ? "Project installation"
            : "Workspace installation"}
        </p>
      </div>
      <InstallationManager
        installation={toSafeInstallation(install)}
        integration={intg}
        postDeleteHref={baseHref}
      />
    </div>
  );
}
