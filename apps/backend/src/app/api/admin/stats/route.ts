import { getAdminSession } from "@/lib/admin-auth";
import { getAdminStats } from "@repo/database";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const authSession = await getAdminSession();

    if (!authSession?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stats = await getAdminStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
