import { getAdminSession } from "@/lib/admin-auth";
import { db, eq } from "@repo/database";
import { orgBilling, organization } from "@repo/database/schema";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

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

    const [org] = await db()
      .select()
      .from(organization)
      .where(eq(organization.id, id))
      .limit(1);

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(org);
  } catch (error) {
    console.error("Error fetching organization:", error);
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

    const body = await request.json();
    const { name, slug, logo } = body;

    const updateData: Partial<typeof organization.$inferInsert> = {};
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (logo !== undefined) updateData.logo = logo;

    const [updatedOrg] = await db()
      .update(organization)
      .set(updateData)
      .where(eq(organization.id, id))
      .returning();

    if (!updatedOrg) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(updatedOrg);
  } catch (error) {
    console.error("Error updating organization:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getAdminSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [billing] = await db()
      .select()
      .from(orgBilling)
      .where(eq(orgBilling.organizationId, id))
      .limit(1);

    if (
      billing?.stripeSubscriptionId &&
      billing.planStatus !== "canceled" &&
      billing.planStatus !== "incomplete"
    ) {
      return NextResponse.json(
        {
          error:
            "Organization has an active Stripe subscription. Cancel it before deleting.",
          code: "ACTIVE_SUBSCRIPTION",
          subscriptionId: billing.stripeSubscriptionId,
          planStatus: billing.planStatus,
        },
        { status: 409 },
      );
    }

    const [deleted] = await db()
      .delete(organization)
      .where(eq(organization.id, id))
      .returning({ id: organization.id });

    if (!deleted) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    revalidatePath("/organizations");
    return NextResponse.json({ status: "deleted", id: deleted.id });
  } catch (error) {
    console.error("Error deleting organization:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to delete organization", message },
      { status: 500 },
    );
  }
}
