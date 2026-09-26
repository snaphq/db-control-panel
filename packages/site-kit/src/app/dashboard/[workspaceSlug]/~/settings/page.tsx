import { requireOrganizationMembership } from "@repo/core/auth/require-membership";
import { WorkspaceSettingsForm } from "@repo/ui/components/workspaces/workspace-settings-form";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspaceSettingsPage({ params }: PageProps) {
  const { workspaceSlug } = await params;

  const { organization: org, membership } = await requireOrganizationMembership(
    workspaceSlug,
    `/dashboard/${workspaceSlug}/~/settings`,
  );

  const role = membership.role ?? "member";
  const canEdit = role === "owner" || role === "admin";

  return (
    <div className="flex flex-col gap-6 px-4 pt-5 pb-20 max-w-[800px]">
      <div>
        <h2 className="font-semibold text-3xl tracking-tight">
          Workspace Settings
        </h2>
        <p className="text-muted-foreground mt-1">
          Manage settings for the{" "}
          <span className="font-medium text-foreground">{org.name}</span>{" "}
          workspace.
        </p>
      </div>

      <WorkspaceSettingsForm
        organizationId={org.id}
        initialName={org.name}
        initialSlug={org.slug}
        role={role}
        canEdit={canEdit}
      />
    </div>
  );
}
