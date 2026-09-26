import { getAdminSession } from "@/lib/admin-auth";
import { db, eq } from "@repo/database";
import { user } from "@repo/database/schema";
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

  const [updated] = await db()
    .update(user)
    .set({ archivedAt: null })
    .where(eq(user.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  revalidatePath("/users");
  revalidatePath(`/users/${id}`);
  return NextResponse.json({ status: "unarchived", user: updated });
}
