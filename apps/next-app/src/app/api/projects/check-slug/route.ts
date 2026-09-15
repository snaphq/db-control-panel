import { auth } from "@repo/auth/server";
import { db, resolveTenantFromHost } from "@repo/database";
import { and, eq } from "@repo/database";
import { member, organization, project } from "@repo/database/schema";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

/**
 * GET /api/projects/check-slug?slug=xxx&organizationId=xxx
 * Check if a project slug is available within an organization
 */
export async function GET(request: Request) {
  try {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({
      headers: requestHeaders,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
    if (!tenant) {
      return NextResponse.json({ error: "Unknown tenant" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");
    const organizationId = searchParams.get("organizationId");

    if (!slug || !organizationId) {
      return NextResponse.json(
        { error: "slug and organizationId are required" },
        { status: 400 },
      );
    }

    // Verify user is a member of the organization
    const memberRecord = await db()
      .select({ id: member.id })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(
        and(
          eq(member.userId, session.user.id),
          eq(member.organizationId, organizationId),
          eq(member.tenantId, tenant.id),
          eq(organization.tenantId, tenant.id),
        ),
      )
      .limit(1);

    if (memberRecord.length === 0) {
      return NextResponse.json(
        { error: "Not a member of this organization" },
        { status: 403 },
      );
    }

    // Check if slug exists
    const existingProject = await db()
      .select()
      .from(project)
      .where(
        and(
          eq(project.organizationId, organizationId),
          eq(project.tenantId, tenant.id),
          eq(project.slug, slug),
        ),
      )
      .limit(1);

    return NextResponse.json({
      available: existingProject.length === 0,
    });
  } catch (error) {
    console.error("Error checking project slug:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
