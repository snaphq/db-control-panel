import { getAdminSession } from "@/lib/admin-auth";
import { getSafeSessions } from "@repo/database";
import { NextResponse } from "next/server";

/** Tenant user sessions across every site; `?tenant=<id>` narrows to one. */
export async function GET(request: Request) {
  try {
    const authSession = await getAdminSession();

    if (!authSession?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId =
      new URL(request.url).searchParams.get("tenant")?.trim() || undefined;
    const sessions = await getSafeSessions({ tenantId });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error("Error fetching sessions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
