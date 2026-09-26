import { auth } from "@repo/auth/server";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { db, eq } from "@repo/database";
import { planTier } from "@repo/database/schema";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await getSiteAdminStatus(session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const updateData: Partial<typeof planTier.$inferInsert> = {};
    if (typeof body.displayName === "string" && body.displayName.trim()) {
      updateData.displayName = body.displayName.trim();
    }
    if (body.description === null || typeof body.description === "string") {
      updateData.description = body.description;
    }
    if (typeof body.isPaid === "boolean") {
      updateData.isPaid = body.isPaid;
    }
    if (typeof body.sortOrder === "number") {
      updateData.sortOrder = body.sortOrder;
    }

    const [updated] = await db()
      .update(planTier)
      .set(updateData)
      .where(eq(planTier.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating plan tier:", error);
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
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await getSiteAdminStatus(session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [tier] = await db()
      .select()
      .from(planTier)
      .where(eq(planTier.id, id))
      .limit(1);
    if (!tier) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (tier.key === "free") {
      return NextResponse.json(
        { error: "Cannot delete the free tier" },
        { status: 400 },
      );
    }

    await db().delete(planTier).where(eq(planTier.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting plan tier:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
