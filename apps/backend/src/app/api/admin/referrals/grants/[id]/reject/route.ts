import { getAdminSession } from "@/lib/admin-auth";
import { rejectCreditGrant } from "@repo/billing";
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await request.json();
  const reason =
    typeof body?.reason === "string" ? body.reason : "Admin rejected";
  try {
    const grant = await rejectCreditGrant(id, reason);
    return NextResponse.json({ grant });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[admin/referrals/grants/[id]/reject] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
