import { getAdminSession } from "@/lib/admin-auth";
import { db, eq } from "@repo/database";
import { tenant } from "@repo/database/schema";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  const session = await getAdminSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await db().update(tenant).set({ status: "active" }).where(eq(tenant.id, id));
  revalidatePath("/tenants");
  return NextResponse.json({ ok: true });
}
