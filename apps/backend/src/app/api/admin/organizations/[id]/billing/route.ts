import { getAdminSession } from "@/lib/admin-auth";
import { getOrgBilling } from "@repo/billing/get-org-billing";
import { db, eq } from "@repo/database";
import { orgBilling } from "@repo/database/schema";
import { NextResponse } from "next/server";

const ALLOWED_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "paused",
] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getAdminSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const billing = await getOrgBilling(id);
    return NextResponse.json(billing);
  } catch (error) {
    console.error("Error fetching org billing:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getAdminSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ensure row exists
    await getOrgBilling(id);

    const body = await request.json();
    const updateData: Partial<typeof orgBilling.$inferInsert> = {
      updatedBy: session.user.id,
    };

    if (typeof body.planTier === "string" && body.planTier.trim()) {
      updateData.planTier = body.planTier.trim();
    }
    if (typeof body.planStatus === "string") {
      if (!ALLOWED_STATUSES.includes(body.planStatus as AllowedStatus)) {
        return NextResponse.json(
          {
            error: `Invalid planStatus. Allowed: ${ALLOWED_STATUSES.join(", ")}`,
          },
          { status: 400 },
        );
      }
      updateData.planStatus = body.planStatus;
    }
    if (typeof body.manualOverride === "boolean") {
      updateData.manualOverride = body.manualOverride;
    }
    if (body.notes === null || typeof body.notes === "string") {
      updateData.notes = body.notes;
    }
    if (body.trialEndsAt === null) {
      updateData.trialEndsAt = null;
    } else if (typeof body.trialEndsAt === "string") {
      const d = new Date(body.trialEndsAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "Invalid trialEndsAt" },
          { status: 400 },
        );
      }
      updateData.trialEndsAt = d;
    }

    const [updated] = await db()
      .update(orgBilling)
      .set(updateData)
      .where(eq(orgBilling.organizationId, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating org billing:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
