import { getAdminSession } from "@/lib/admin-auth";
import { createPricingPlan, listPricingPlans } from "@repo/billing";
import { revalidateTag } from "next/cache";
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

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const plans = await listPricingPlans();
  return NextResponse.json({ plans });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await request.json();
  if (!body?.key || !body?.displayName) {
    return NextResponse.json(
      { error: "key and displayName are required" },
      { status: 400 },
    );
  }
  try {
    const plan = await createPricingPlan(body);
    revalidateTag("pricing", "max");
    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[admin/pricing-plans] create failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
