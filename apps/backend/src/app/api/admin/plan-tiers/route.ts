import { getAdminSession } from "@/lib/admin-auth";
import { db, eq } from "@repo/database";
import { planTier } from "@repo/database/schema";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tiers = await db().select().from(planTier);
    tiers.sort((a, b) => a.sortOrder - b.sortOrder);
    return NextResponse.json(tiers);
  } catch (error) {
    console.error("Error fetching plan tiers:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getAdminSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const key = typeof body.key === "string" ? body.key.trim() : "";
    const displayName =
      typeof body.displayName === "string" ? body.displayName.trim() : "";

    if (!key || !displayName) {
      return NextResponse.json(
        { error: "key and displayName are required" },
        { status: 400 },
      );
    }
    if (!/^[a-z0-9_-]+$/i.test(key)) {
      return NextResponse.json(
        { error: "key must be alphanumeric, underscore, or dash" },
        { status: 400 },
      );
    }

    const existing = await db()
      .select()
      .from(planTier)
      .where(eq(planTier.key, key))
      .limit(1);
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "A plan tier with that key already exists" },
        { status: 409 },
      );
    }

    const [created] = await db()
      .insert(planTier)
      .values({
        id: nanoid(),
        key,
        displayName,
        description:
          typeof body.description === "string" ? body.description : null,
        isPaid: typeof body.isPaid === "boolean" ? body.isPaid : false,
        sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating plan tier:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
