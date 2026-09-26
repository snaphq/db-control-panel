import { requireProjectMembership } from "@repo/core/auth/require-membership";
import {
  agent,
  agentInstallation,
  and,
  db,
  eq,
  inArray,
  ne,
} from "@repo/database";
import { AgentsBrowser } from "@repo/react-ui/components/agents/agents-browser";

interface PageProps {
  params: Promise<{ workspaceSlug: string; projectSlug: string }>;
}

export const dynamic = "force-dynamic";

export default async function ProjectAgentsPage({ params }: PageProps) {
  const { workspaceSlug, projectSlug } = await params;
  const { project } = await requireProjectMembership(
    workspaceSlug,
    projectSlug,
    `/dashboard/${workspaceSlug}/${projectSlug}/agents`,
  );

  const available = await db()
    .select()
    .from(agent)
    .where(and(ne(agent.status, "hidden"), ne(agent.status, "deprecated")))
    .orderBy(agent.slug);

  const installs = available.length
    ? await db()
        .select()
        .from(agentInstallation)
        .where(
          and(
            eq(agentInstallation.projectId, project.id),
            inArray(
              agentInstallation.agentId,
              available.map((a) => a.id),
            ),
          ),
        )
    : [];

  return (
    <div className="flex flex-col gap-6 px-4 pt-5 pb-20">
      <div>
        <h2 className="font-semibold text-3xl tracking-tight">Agents</h2>
        <p className="text-muted-foreground mt-1">
          Install AI agents into the{" "}
          <span className="font-medium text-foreground">{project.name}</span>{" "}
          project.
        </p>
      </div>

      <AgentsBrowser
        projectId={project.id}
        agents={available}
        installations={installs}
      />
    </div>
  );
}
