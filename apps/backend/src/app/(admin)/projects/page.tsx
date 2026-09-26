import { ProjectTable } from "@/components/admin/ProjectTable";
import { db } from "@repo/database";
import { eq } from "@repo/database";
import { organization, project } from "@repo/database/schema";

async function getProjects() {
  try {
    const projects = await db()
      .select()
      .from(project)
      .orderBy(project.createdAt);

    // Fetch organizations for each project
    const projectsWithOrgs = await Promise.all(
      projects.map(async (p) => {
        const [org] = await db()
          .select()
          .from(organization)
          .where(eq(organization.id, p.organizationId))
          .limit(1);
        return { ...p, organization: org || null };
      }),
    );

    return projectsWithOrgs;
  } catch (error) {
    console.error("Error fetching projects:", error);
    return [];
  }
}

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">
          Project Management
        </h1>
        <p className="text-muted-foreground">
          View and manage all projects across organizations
        </p>
      </div>
      <ProjectTable projects={projects} />
    </div>
  );
}
