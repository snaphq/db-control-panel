import { getAdminSession } from "@/lib/admin-auth";
import { validateStripePriceId } from "@repo/billing";
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

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await request.json();
  if (!body?.priceId || typeof body.priceId !== "string") {
    return NextResponse.json({ error: "priceId is required" }, { status: 400 });
  }
  try {
    const result = await validateStripePriceId(body.priceId.trim());
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(
      "[admin/pricing-plans/validate-stripe-price] failed:",
      message,
    );
    return NextResponse.json({ valid: false, error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
