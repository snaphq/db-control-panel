import { getAdminSession } from "@/lib/admin-auth";
import { ORG_STATUS } from "@repo/billing/constants";
import { db, eq } from "@repo/database";
import { organization } from "@repo/database/schema";
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
    .update(organization)
    .set({ status: ORG_STATUS.ACTIVE })
    .where(eq(organization.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json(
      { error: "Organization not found" },
      { status: 404 },
    );
  }

  revalidatePath("/organizations");
  revalidatePath(`/organizations/${id}`);
  return NextResponse.json({ status: "unarchived", organization: updated });
}
