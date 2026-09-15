import { requireOrganizationMembership } from "@/lib/auth/require-membership";
import {
  listAvailableIntegrations,
  listScopedInstallations,
} from "@/lib/integrations/queries";
import { ConsoleView } from "./(components)/ConsoleView";
import { IntegrationsPageShell } from "./(components)/IntegrationsPageShell";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspaceIntegrationsPage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const { organization } = await requireOrganizationMembership(
    workspaceSlug,
    `/dashboard/${workspaceSlug}/~/integrations`,
  );

  const [installs, available] = await Promise.all([
    listScopedInstallations({
      tenantId: organization.tenantId,
      organizationId: organization.id,
      projectId: null,
    }),
    listAvailableIntegrations(),
  ]);

  return (
    <IntegrationsPageShell workspaceSlug={workspaceSlug} activeTab="console">
      <ConsoleView
        workspaceSlug={workspaceSlug}
        installs={installs}
        available={available}
      />
    </IntegrationsPageShell>
  );
}
