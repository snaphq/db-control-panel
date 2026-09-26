import { requireOrganizationMembership } from "@repo/core/auth/require-membership";
import { listAvailableIntegrations } from "@repo/core/integrations/queries";
import { IntegrationsPageShell } from "../(components)/IntegrationsPageShell";
import { MarketplaceView } from "../(components)/MarketplaceView";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function IntegrationsMarketplacePage({
  params,
}: PageProps) {
  const { workspaceSlug } = await params;
  await requireOrganizationMembership(
    workspaceSlug,
    `/dashboard/${workspaceSlug}/~/integrations/marketplace`,
  );

  const available = await listAvailableIntegrations();

  return (
    <IntegrationsPageShell
      workspaceSlug={workspaceSlug}
      activeTab="marketplace"
    >
      <MarketplaceView workspaceSlug={workspaceSlug} integrations={available} />
    </IntegrationsPageShell>
  );
}
