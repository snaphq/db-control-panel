import { auth } from "@repo/auth/server";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { db, eq } from "@repo/database";
import { session as sessionTable, user } from "@repo/database/schema";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await getSiteAdminStatus(session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  revalidatePath("/adminx/users");
  revalidatePath(`/adminx/users/${id}`);
  return NextResponse.json({ status: "archived", user: updated });
}
