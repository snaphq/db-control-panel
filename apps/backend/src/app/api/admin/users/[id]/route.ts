import { getAdminSession } from "@/lib/admin-auth";
import { and, buildTenantAuthEmail, db, eq } from "@repo/database";
import { member, organization, user } from "@repo/database/schema";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getAdminSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [userRecord] = await db()
      .select()
      .from(user)
      .where(eq(user.id, id))
      .limit(1);

    if (!userRecord) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(userRecord);
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getAdminSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, email, role, emailVerified } = body;

    const updateData: Partial<typeof user.$inferInsert> = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) {
      const [existing] = await db()
        .select({ tenantId: user.tenantId })
        .from(user)
        .where(eq(user.id, id))
        .limit(1);
      if (!existing) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      const publicEmail = email.toString().trim().toLowerCase();
      updateData.publicEmail = publicEmail;
      updateData.email = buildTenantAuthEmail(existing.tenantId, publicEmail);
    }
    if (role !== undefined) updateData.role = role;
    if (emailVerified !== undefined) updateData.emailVerified = emailVerified;

    const [updatedUser] = await db()
      .update(user)
      .set(updateData)
      .where(eq(user.id, id))
      .returning();

    if (!updatedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getAdminSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (id === session.user.id) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 },
      );
    }

    const ownedOrgs = await db()
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      })
      .from(organization)
      .innerJoin(
        member,
        and(eq(member.organizationId, organization.id), eq(member.userId, id)),
      )
      .where(eq(member.role, "owner"));

    if (ownedOrgs.length > 0) {
      return NextResponse.json(
        {
          error:
            "User still owns organizations. Reassign or delete them first.",
          code: "USER_OWNS_ORGANIZATIONS",
          organizations: ownedOrgs,
        },
        { status: 409 },
      );
    }

    const [deleted] = await db()
      .delete(user)
      .where(eq(user.id, id))
      .returning({ id: user.id });

    if (!deleted) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    revalidatePath("/users");
    return NextResponse.json({ status: "deleted", id: deleted.id });
  } catch (error) {
    console.error("Error deleting user:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to delete user", message },
      { status: 500 },
    );
  }
}
