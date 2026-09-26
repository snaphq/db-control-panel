import { auth } from "@repo/auth/server";
import { getReferralConfig, updateReferralConfig } from "@repo/billing";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
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

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const config = await getReferralConfig();
    return NextResponse.json({ config });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[admin/referrals/settings] get failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await request.json();
  try {
    const config = await updateReferralConfig(body);
    return NextResponse.json({ config });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[admin/referrals/settings] update failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
