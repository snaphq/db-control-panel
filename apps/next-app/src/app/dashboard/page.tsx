import { getCurrentTenant } from "@/lib/tenant";
import { auth } from "@repo/auth/server";
import { db } from "@repo/database";
import { and, eq, inArray } from "@repo/database";
import { member, organization } from "@repo/database/schema";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }
  const tenant = await getCurrentTenant();

  // Get user's organizations
  const userMembers = await db()
    .select()
    .from(member)
    .where(
      and(eq(member.userId, session.user.id), eq(member.tenantId, tenant.id)),
    );

  if (userMembers.length === 0) {
    redirect("/auth/onboarding");
  }

  const organizationIds = userMembers.map((m) => m.organizationId);

  const organizations = await db()
    .select()
    .from(organization)
    .where(
      and(
        eq(organization.tenantId, tenant.id),
        inArray(organization.id, organizationIds),
      ),
    )
    .limit(1);

  if (organizations.length === 0) {
    redirect("/auth/onboarding");
  }

  // Redirect to the first workspace
  redirect(`/dashboard/${organizations[0].slug}`);
}
