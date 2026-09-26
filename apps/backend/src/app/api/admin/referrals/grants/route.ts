import { getAdminSession } from "@/lib/admin-auth";
import { adminListCreditGrants } from "@repo/billing";
import type { GrantStatus } from "@repo/billing";
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

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const url = new URL(request.url);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "20", 10)),
  );
  const offset = Math.max(
    0,
    Number.parseInt(url.searchParams.get("offset") ?? "0", 10),
  );
  const status = (url.searchParams.get("status") ?? undefined) as
    | GrantStatus
    | undefined;
  try {
    const result = await adminListCreditGrants({ limit, offset, status });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[admin/referrals/grants] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
