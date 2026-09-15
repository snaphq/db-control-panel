import { auth } from "@repo/auth/server";
import { db, resolveTenantFromHost } from "@repo/database";
import { and, eq } from "@repo/database";
import { member, organization, project } from "@repo/database/schema";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id]
 * Get a single project by ID
 */
export async function GET(request: Request, { params }: RouteParams) {
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

    const { id } = await params;

    const [projectRecord] = await db()
      .select()
      .from(project)
      .where(and(eq(project.id, id), eq(project.tenantId, tenant.id)))
      .limit(1);

    if (!projectRecord) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Verify user is a member of the organization
    const memberRecord = await db()
      .select({ id: member.id })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(
        and(
          eq(member.userId, session.user.id),
          eq(member.organizationId, projectRecord.organizationId),
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

    return NextResponse.json(projectRecord);
  } catch (error) {
    console.error("Error getting project:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/projects/[id]
 * Update a project
 */
export async function PUT(request: Request, { params }: RouteParams) {
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

    const { id } = await params;
    const body = await request.json();
    const { name, slug, description } = body;

    const [existingProject] = await db()
      .select()
      .from(project)
      .where(and(eq(project.id, id), eq(project.tenantId, tenant.id)))
      .limit(1);

    if (!existingProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Verify user is a member of the organization
    const memberRecord = await db()
      .select({ id: member.id })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(
        and(
          eq(member.userId, session.user.id),
          eq(member.organizationId, existingProject.organizationId),
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

    // If slug is being changed, check if it's already taken
    if (slug && slug !== existingProject.slug) {
      const slugConflict = await db()
        .select()
        .from(project)
        .where(
          and(
            eq(project.organizationId, existingProject.organizationId),
            eq(project.tenantId, tenant.id),
            eq(project.slug, slug),
          ),
        )
        .limit(1);

      if (slugConflict.length > 0) {
        return NextResponse.json(
          {
            error: "A project with this slug already exists in this workspace",
          },
          { status: 409 },
        );
      }
    }

    const updateData: Partial<typeof existingProject> = {};
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (description !== undefined) updateData.description = description;

    const [updatedProject] = await db()
      .update(project)
      .set(updateData)
      .where(and(eq(project.id, id), eq(project.tenantId, tenant.id)))
      .returning();

    return NextResponse.json(updatedProject);
  } catch (error) {
    console.error("Error updating project:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/projects/[id]
 * Delete a project (cannot delete default or last project)
 */
export async function DELETE(request: Request, { params }: RouteParams) {
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

    const { id } = await params;

    const [existingProject] = await db()
      .select()
      .from(project)
      .where(and(eq(project.id, id), eq(project.tenantId, tenant.id)))
      .limit(1);

    if (!existingProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Verify user is a member of the organization
    const memberRecord = await db()
      .select({ id: member.id })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(
        and(
          eq(member.userId, session.user.id),
          eq(member.organizationId, existingProject.organizationId),
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

    // Cannot delete the default project
    if (existingProject.isDefault) {
      return NextResponse.json(
        { error: "Cannot delete the default project" },
        { status: 400 },
      );
    }

    // Check if this is the last project
    const projectCount = await db()
      .select()
      .from(project)
      .where(
        and(
          eq(project.organizationId, existingProject.organizationId),
          eq(project.tenantId, tenant.id),
        ),
      );

    if (projectCount.length <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last project in a workspace" },
        { status: 400 },
      );
    }

    await db()
      .delete(project)
      .where(and(eq(project.id, id), eq(project.tenantId, tenant.id)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting project:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
