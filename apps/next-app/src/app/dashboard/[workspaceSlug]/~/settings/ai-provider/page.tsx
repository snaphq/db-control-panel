import { getOrgOpenAIConfigMasked } from "@repo/core/ai-provider";
import { requireOrganizationMembership } from "@repo/core/auth/require-membership";
import { WorkspaceAiProviderForm } from "@repo/ui/components/workspaces/workspace-ai-provider-form";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export const dynamic = "force-dynamic";

export default async function WorkspaceAiProviderPage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const { organization: org, membership } = await requireOrganizationMembership(
    workspaceSlug,
    `/dashboard/${workspaceSlug}/~/settings/ai-provider`,
  );
  const role = membership.role ?? "member";
  if (role !== "owner" && role !== "admin") notFound();

  const initial = await getOrgOpenAIConfigMasked(org.id);

  return (
    <div className="flex flex-col gap-6 px-4 pt-5 pb-20 max-w-[800px]">
      <div>
        <h2 className="font-semibold text-3xl tracking-tight">AI Provider</h2>
        <p className="text-muted-foreground mt-1">
          Override the platform-wide OpenAI provider for the{" "}
          <span className="font-medium text-foreground">{org.name}</span>{" "}
          workspace. Unset fields fall back to the platform default.
        </p>
      </div>
      <WorkspaceAiProviderForm organizationId={org.id} initial={initial} />
    </div>
  );
}
