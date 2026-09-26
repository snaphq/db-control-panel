import { auth } from "@repo/auth/server";
import { getCurrentTenant } from "@repo/core/tenant";
import { db } from "@repo/database";
import { and, eq } from "@repo/database";
import { invitation, member, organization, user } from "@repo/database/schema";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { MembersSettings } from "./MembersSettings";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function MembersPage({ params }: PageProps) {
  const { workspaceSlug } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect(
      `/auth/sign-in?redirect=/dashboard/${workspaceSlug}/~/settings/members`,
    );
  }
  const tenant = await getCurrentTenant();

  // Get organization by slug
  const org = await db()
    .select()
    .from(organization)
    .where(
      and(
        eq(organization.tenantId, tenant.id),
        eq(organization.slug, workspaceSlug),
      ),
    )
    .limit(1);

  if (!org[0]) {
    notFound();
  }

  // Check user membership
  const membership = await db()
    .select()
    .from(member)
    .where(
      and(
        eq(member.organizationId, org[0].id),
        eq(member.userId, session.user.id),
        eq(member.tenantId, tenant.id),
      ),
    )
    .limit(1);

  if (!membership[0]) {
    notFound();
  }

  const [members, pendingInvitations] = await Promise.all([
    // Get all members with user details
    db()
      .select({
        id: member.id,
        role: member.role,
        createdAt: member.createdAt,
        userId: member.userId,
        userName: user.name,
        userEmail: user.publicEmail,
        userImage: user.image,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(
        and(
          eq(member.organizationId, org[0].id),
          eq(member.tenantId, tenant.id),
          eq(user.tenantId, tenant.id),
        ),
      ),
    // Get pending invitations
    db()
      .select()
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, org[0].id),
          eq(invitation.status, "pending"),
          eq(invitation.tenantId, tenant.id),
        ),
      ),
  ]);

  const currentUserRole = membership[0].role;
  const canManageMembers =
    currentUserRole === "owner" || currentUserRole === "admin";

  return (
    <div className="flex flex-wrap justify-start items-center gap-4 px-4 pt-5">
      <div className="flex flex-col gap-3 mb-20 w-full max-w-[700px]">
        <h2 className="mt-10 first:mt-0 pb-2 border-b w-full font-semibold text-3xl tracking-tight transition-colors scroll-m-20">
          Members
        </h2>
        <p className="text-muted-foreground">
          Manage team members and invitations for this workspace.
        </p>

        <MembersSettings
          organizationId={org[0].id}
          organizationSlug={org[0].slug}
          currentUserId={session.user.id}
          currentUserRole={currentUserRole}
          canManageMembers={canManageMembers}
          initialMembers={members}
          initialInvitations={pendingInvitations.map((inv) => ({
            id: inv.id,
            email: inv.email,
            role: inv.role,
            status: inv.status,
            expiresAt: inv.expiresAt.toISOString(),
            createdAt: inv.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
