import { auth } from "@repo/auth/server";
import {
  deletePricingPlan,
  getPricingPlan,
  updatePricingPlan,
} from "@repo/billing";
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;
  const plan = await getPricingPlan(id);
  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ plan });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await request.json();
  try {
    const plan = await updatePricingPlan(id, body);
    revalidateTag("pricing", "max");
    return NextResponse.json({ plan });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[admin/pricing-plans/[id]] update failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;
  try {
    await deletePricingPlan(id);
    revalidateTag("pricing", "max");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[admin/pricing-plans/[id]] delete failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
