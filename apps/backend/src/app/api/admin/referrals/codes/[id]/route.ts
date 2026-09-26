import { getAdminSession } from "@/lib/admin-auth";
import { setReferralCodeActive } from "@repo/billing";
import { NextResponse } from "next/server";

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { userId: session.user.id };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await request.json();
  if (typeof body?.isActive !== "boolean") {
    return NextResponse.json(
      { error: "isActive boolean is required" },
      { status: 400 },
    );
  }
  try {
    const code = await setReferralCodeActive(id, body.isActive);
    return NextResponse.json({ code });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[admin/referrals/codes/[id]] update failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
