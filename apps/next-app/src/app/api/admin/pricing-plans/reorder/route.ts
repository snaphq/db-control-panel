import { auth } from "@repo/auth/server";
import { reorderPricingPlans } from "@repo/billing";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const isAdmin = await getSiteAdminStatus(session.user.id);
  if (!isAdmin) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { userId: session.user.id };
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await request.json();
  if (!Array.isArray(body?.orderedIds) || body.orderedIds.length === 0) {
    return NextResponse.json(
      { error: "orderedIds array is required" },
      { status: 400 },
    );
  }
  try {
    await reorderPricingPlans(body.orderedIds);
    revalidateTag("pricing", "max");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[admin/pricing-plans/reorder] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
