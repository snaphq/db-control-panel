import { getCurrentTenant } from "@/lib/tenant";
import { auth } from "@repo/auth/server";
import { db } from "@repo/database";
import { and, desc, eq } from "@repo/database";
import { member, organization, project } from "@repo/database/schema";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ProjectsOverview } from "./(components)/ProjectsOverview";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspacePage({ params }: PageProps) {
  const { workspaceSlug } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }
  const tenant = await getCurrentTenant();

  const [org] = await db()
    .select()
    .from(organization)
    .where(
      and(
        eq(organization.tenantId, tenant.id),
        eq(organization.slug, workspaceSlug),
      ),
    )
    .limit(1);

  if (!org) {
    notFound();
  }

  const [memberRecord] = await db()
    .select()
    .from(member)
    .where(
      and(
        eq(member.userId, session.user.id),
        eq(member.organizationId, org.id),
        eq(member.tenantId, tenant.id),
      ),
    )
    .limit(1);

  if (!memberRecord) {
    notFound();
  }

  const projects = await db()
    .select()
    .from(project)
    .where(
      and(eq(project.organizationId, org.id), eq(project.tenantId, tenant.id)),
    )
    .orderBy(desc(project.updatedAt));

  const canManageMembers =
    memberRecord.role === "owner" || memberRecord.role === "admin";

  return (
    <ProjectsOverview
      workspaceSlug={workspaceSlug}
      orgName={org.name}
      organizationId={org.id}
      canManageMembers={canManageMembers}
      projects={projects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        isDefault: p.isDefault,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt,
      }))}
    />
  );
}
