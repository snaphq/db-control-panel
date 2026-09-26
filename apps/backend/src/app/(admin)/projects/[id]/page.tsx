import { db } from "@repo/database";
import { eq } from "@repo/database";
import { organization, project } from "@repo/database/schema";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";

async function getProject(id: string) {
  try {
    const [projectRecord] = await db()
      .select()
      .from(project)
      .where(eq(project.id, id))
      .limit(1);

    if (!projectRecord) return null;

    const [org] = await db()
      .select()
      .from(organization)
      .where(eq(organization.id, projectRecord.organizationId))
      .limit(1);

    return { ...projectRecord, organization: org || null };
  } catch (error) {
    console.error("Error fetching project:", error);
    return null;
  }
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projectData = await getProject(id);

  if (!projectData) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">
            Project Details
          </h1>
          <p className="text-muted-foreground">View project information</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/projects">Back to Projects</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Project Information
            {projectData.isDefault && (
              <Badge variant="secondary">Default</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <span className="text-sm font-medium text-muted-foreground block">
              ID
            </span>
            <p className="font-mono text-sm">{projectData.id}</p>
          </div>
          <div>
            <span className="text-sm font-medium text-muted-foreground block">
              Name
            </span>
            <p>{projectData.name}</p>
          </div>
          <div>
            <span className="text-sm font-medium text-muted-foreground block">
              Slug
            </span>
            <p className="font-mono">{projectData.slug}</p>
          </div>
          {projectData.description && (
            <div>
              <span className="text-sm font-medium text-muted-foreground block">
                Description
              </span>
              <p>{projectData.description}</p>
            </div>
          )}
          <div>
            <span className="text-sm font-medium text-muted-foreground block">
              Organization
            </span>
            {projectData.organization ? (
              <p>
                <Link
                  href={`/organizations/${projectData.organizationId}`}
                  className="text-blue-600 hover:underline"
                >
                  {projectData.organization.name}
                </Link>
                <span className="text-muted-foreground ml-2">
                  ({projectData.organization.slug})
                </span>
              </p>
            ) : (
              <p className="text-muted-foreground">Unknown organization</p>
            )}
          </div>
          <div>
            <span className="text-sm font-medium text-muted-foreground block">
              Created At
            </span>
            <p>{new Date(projectData.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-sm font-medium text-muted-foreground block">
              Updated At
            </span>
            <p>{new Date(projectData.updatedAt).toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
