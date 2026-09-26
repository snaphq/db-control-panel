import { requireOrganizationMembership } from "@repo/core/auth/require-membership";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function AgentUsagePage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  await requireOrganizationMembership(
    workspaceSlug,
    `/dashboard/${workspaceSlug}/~/agents/usage`,
  );

  return (
    <div className="flex flex-col gap-4 px-4 pt-5">
      <h1 className="text-2xl font-normal tracking-tight">Agent Usage</h1>
      <p className="text-muted-foreground">
        Track token consumption, run counts, and cost across your agents.
      </p>

      <div className="mt-6 rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800 p-10 text-center">
        <p className="text-sm text-muted-foreground">
          No usage data yet. Metrics will populate as your agents run.
        </p>
      </div>
    </div>
  );
}
