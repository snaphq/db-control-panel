import { getAdminSession } from "@/lib/admin-auth";
import { db, eq } from "@repo/database";
import { session as sessionTable, user } from "@repo/database/schema";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (id === session.user.id) {
    return NextResponse.json(
      { error: "You cannot archive your own account" },
      { status: 400 },
    );
  }

  const [updated] = await db()
    .update(user)
    .set({ archivedAt: new Date() })
    .where(eq(user.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Invalidate all active sessions for this user so they're booted immediately.
  await db().delete(sessionTable).where(eq(sessionTable.userId, id));

  revalidatePath("/users");
  revalidatePath(`/users/${id}`);
  return NextResponse.json({ status: "archived", user: updated });
}
