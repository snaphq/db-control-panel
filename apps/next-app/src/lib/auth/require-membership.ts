import { auth } from "@repo/auth/server";
import { and, db, eq } from "@repo/database";
import {
  type Member,
  type Organization,
  type Project,
  member,
  organization,
  project,
} from "@repo/database/schema";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getCurrentTenant } from "../tenant";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role?: string | null;
};

export async function requireSession(redirectTo?: string): Promise<{
  user: SessionUser;
}> {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result?.user?.id) {
    redirect(
      redirectTo
        ? `/auth/sign-in?redirect=${encodeURIComponent(redirectTo)}`
        : "/auth/sign-in",
    );
  }
  return { user: result.user as SessionUser };
}

export async function requireOrganizationMembership(
  workspaceSlug: string,
  redirectTo?: string,
): Promise<{
  user: SessionUser;
  organization: Organization;
  membership: Member;
}> {
  const { user } = await requireSession(redirectTo);
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
  if (!org) notFound();

  const [membership] = await db()
    .select()
    .from(member)
    .where(
      and(
        eq(member.organizationId, org.id),
        eq(member.userId, user.id),
        eq(member.tenantId, tenant.id),
      ),
    )
    .limit(1);
  if (!membership) notFound();

  return { user, organization: org, membership };
}

export async function requireProjectMembership(
  workspaceSlug: string,
  projectSlug: string,
  redirectTo?: string,
): Promise<{
  user: SessionUser;
  organization: Organization;
  membership: Member;
  project: Project;
}> {
  const {
    user,
    organization: org,
    membership,
  } = await requireOrganizationMembership(workspaceSlug, redirectTo);

  const [proj] = await db()
    .select()
    .from(project)
    .where(
      and(
        eq(project.organizationId, org.id),
        eq(project.tenantId, org.tenantId),
        eq(project.slug, projectSlug),
      ),
    )
    .limit(1);
  if (!proj) notFound();

  return { user, organization: org, membership, project: proj };
}

export async function requireAdmin(redirectTo?: string): Promise<{
  user: SessionUser;
}> {
  const { user } = await requireSession(redirectTo);
  if (user.role !== "site-admin" && user.role !== "admin") {
    notFound();
  }
  return { user };
}
