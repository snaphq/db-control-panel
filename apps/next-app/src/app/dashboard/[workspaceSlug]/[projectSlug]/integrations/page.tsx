import { AvailableIntegrationsList } from "@/components/integrations/available-integrations-list";
import { InstalledIntegrationsList } from "@/components/integrations/installed-integrations-list";
import { requireProjectMembership } from "@/lib/auth/require-membership";
import {
  listAvailableIntegrations,
  listScopedInstallations,
} from "@/lib/integrations/queries";

interface PageProps {
  params: Promise<{ workspaceSlug: string; projectSlug: string }>;
}

export default async function ProjectIntegrationsPage({ params }: PageProps) {
  const { workspaceSlug, projectSlug } = await params;
  const { organization, project } = await requireProjectMembership(
    workspaceSlug,
    projectSlug,
    `/dashboard/${workspaceSlug}/${projectSlug}/integrations`,
  );

  const [installs, available] = await Promise.all([
    listScopedInstallations({
      tenantId: organization.tenantId,
      organizationId: organization.id,
      projectId: project.id,
    }),
    listAvailableIntegrations(),
  ]);

  const baseHref = `/dashboard/${workspaceSlug}/${projectSlug}/integrations`;

  return (
    <div className="flex flex-col gap-6 px-4 pt-5 pb-20">
      <div>
        <h2 className="font-semibold text-3xl tracking-tight">Integrations</h2>
        <p className="text-muted-foreground mt-1">
          Connect external services to the{" "}
          <span className="font-medium text-foreground">{project.name}</span>{" "}
          project.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 grid gap-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Installed
          </h3>
          <InstalledIntegrationsList items={installs} baseHref={baseHref} />
        </section>
        <section className="grid gap-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Available
          </h3>
          <AvailableIntegrationsList
            integrations={available}
            baseHref={baseHref}
          />
        </section>
      </div>
    </div>
  );
}
