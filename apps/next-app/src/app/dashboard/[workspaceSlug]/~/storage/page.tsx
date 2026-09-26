import { requireOrganizationMembership } from "@repo/core/auth/require-membership";
import { StoragePage } from "./(components)/StoragePage";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspaceStoragePage({ params }: PageProps) {
  const { workspaceSlug } = await params;

  await requireOrganizationMembership(
    workspaceSlug,
    `/dashboard/${workspaceSlug}/~/storage`,
  );

  const isConfigured = !!process.env.OBJECT_STORAGE_PROVIDER;

  return (
    <div className="flex flex-col gap-6 px-4 pt-5 pb-20 max-w-[900px]">
      <div>
        <h2 className="font-semibold text-3xl tracking-tight">Storage</h2>
        <p className="text-muted-foreground mt-1">
          Upload and manage files for this workspace.
        </p>
      </div>
      <StoragePage workspaceSlug={workspaceSlug} isConfigured={isConfigured} />
    </div>
  );
}
