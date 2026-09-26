import { requireProjectMembership } from "@repo/core/auth/require-membership";
import { ProjectSettingsForm } from "@repo/ui/components/projects/project-settings-form";

interface PageProps {
  params: Promise<{ workspaceSlug: string; projectSlug: string }>;
}

export default async function ProjectSettingsPage({ params }: PageProps) {
  const { workspaceSlug, projectSlug } = await params;
  const { project: proj } = await requireProjectMembership(
    workspaceSlug,
    projectSlug,
    `/dashboard/${workspaceSlug}/${projectSlug}/settings`,
  );

  return (
    <div className="flex flex-col gap-6 px-4 pt-5 pb-20 max-w-[800px]">
      <div>
        <h2 className="font-semibold text-3xl tracking-tight">
          Project Settings
        </h2>
        <p className="text-muted-foreground mt-1">
          Manage settings for the{" "}
          <span className="font-medium text-foreground">{proj.name}</span>{" "}
          project.
        </p>
      </div>

      <ProjectSettingsForm
        projectId={proj.id}
        initialName={proj.name}
        workspaceSlug={workspaceSlug}
        currentSlug={proj.slug}
      />
    </div>
  );
}
