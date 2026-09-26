import { auth } from "@repo/auth/server";
import { ORG_STATUS } from "@repo/billing/constants";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { db, eq } from "@repo/database";
import { organization } from "@repo/database/schema";
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

  revalidatePath("/adminx/organizations");
  revalidatePath(`/adminx/organizations/${id}`);
  return NextResponse.json({ status: "unarchived", organization: updated });
}
