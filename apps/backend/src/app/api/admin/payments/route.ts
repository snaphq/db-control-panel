import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@repo/database";
import { payments } from "@repo/database/schema";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await getAdminSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const paymentRecords = await db()
      .select()
      .from(payments)
      .orderBy(payments.created_time);

    return NextResponse.json(paymentRecords);
  } catch (error) {
    console.error("Error fetching payments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
